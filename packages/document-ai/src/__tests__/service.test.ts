import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '../test-setup';
import { DocumentAIServiceImpl } from '../service';
import { OperationType, ModelTarget } from '@inkwell/shared';

/**
 * Helper: Build an SSE body from event objects.
 */
function buildSSEBody(
  events: Array<{ event: string; data: unknown }>,
): string {
  return events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
}

describe('DocumentAIServiceImpl', () => {
  const service = new DocumentAIServiceImpl({
    apiKey: 'test-key-123',
  });

  it('should route operations based on type', () => {
    // Rewrite -> Sonnet
    expect(service.route(OperationType.Rewrite)).toBe(ModelTarget.Sonnet);
    // Critique -> Opus
    expect(service.route(OperationType.Critique)).toBe(ModelTarget.Opus);
    // InlineSuggest -> Local
    expect(service.route(OperationType.InlineSuggest)).toBe(ModelTarget.Local);
  });

  it('should build context with stable/volatile splitting', () => {
    const ctx = service.buildContext(
      '# My Document\n\nThis is the body of the document with some content.',
      20,
    );

    expect(ctx.stablePrefix).toBeTruthy();
    expect(ctx.stablePrefix).toContain('InkWell AI');
    expect(ctx.volatileSuffix).toBeTruthy();
    expect(ctx.tokenCount).toBeGreaterThan(0);
    expect(ctx.cacheKey).toBeTruthy();
  });

  it('should execute full rewrite pipeline with mock Claude response', async () => {
    const instructions = [
      { type: 'replace', range: { from: 0, to: 10 }, content: 'Rewritten text' },
    ];

    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        const sseBody = buildSSEBody([
          {
            event: 'message_start',
            data: {
              type: 'message_start',
              message: {
                id: 'msg_test',
                type: 'message',
                role: 'assistant',
                model: 'claude-sonnet-4-5-20250929',
              },
            },
          },
          {
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: JSON.stringify(instructions) },
            },
          },
          {
            event: 'message_stop',
            data: { type: 'message_stop' },
          },
        ]);

        return new HttpResponse(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const result = await service.executeOperation({
      operation: OperationType.Rewrite,
      docContent: 'Hello world document content.',
      cursorPos: 5,
      selection: { from: 0, to: 10, text: 'Hello worl' },
      targetTone: 'formal',
    });

    expect(result.model).toBe(ModelTarget.Sonnet);
    expect(result.instructions).toHaveLength(1);
    expect(result.instructions[0].content).toBe('Rewritten text');
  });

  it('should throw after destroy()', async () => {
    const disposable = new DocumentAIServiceImpl({ apiKey: 'test-key' });
    disposable.destroy();

    await expect(
      disposable.executeOperation({
        operation: OperationType.Rewrite,
        docContent: 'test',
        cursorPos: 0,
      }),
    ).rejects.toThrow(/destroyed/);
  });

  it('should include cache_control on system message in requests', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;

        const sseBody = buildSSEBody([
          {
            event: 'message_start',
            data: {
              type: 'message_start',
              message: {
                id: 'msg_test',
                type: 'message',
                role: 'assistant',
                model: 'claude-sonnet-4-5-20250929',
              },
            },
          },
          {
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: '[]' },
            },
          },
          {
            event: 'message_stop',
            data: { type: 'message_stop' },
          },
        ]);

        return new HttpResponse(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    await service.executeOperation({
      operation: OperationType.Summarize,
      docContent: 'A document to summarize.',
      cursorPos: 0,
      selection: { from: 0, to: 24, text: 'A document to summarize.' },
    });

    expect(capturedBody).not.toBeNull();
    const system = capturedBody!.system as Array<{ cache_control: unknown }>;
    expect(Array.isArray(system)).toBe(true);
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
  });
});
