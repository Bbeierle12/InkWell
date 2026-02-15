/**
 * VoiceRefine Service Tests
 *
 * Tests that VoiceRefine operations return raw text (not JSON instructions),
 * route to Sonnet, and pass rawTranscript to the prompt.
 */
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '../test-setup';
import { DocumentAIServiceImpl } from '../service';
import { OperationType, ModelTarget } from '@inkwell/shared';

function buildSSEBody(
  events: Array<{ event: string; data: unknown }>,
): string {
  return events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
}

describe('VoiceRefine', () => {
  const service = new DocumentAIServiceImpl({
    apiKey: 'test-key-123',
  });

  it('should route VoiceRefine to Sonnet', () => {
    expect(service.route(OperationType.VoiceRefine)).toBe(ModelTarget.Sonnet);
  });

  it('should return raw text for VoiceRefine (not JSON instructions)', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        const sseBody = buildSSEBody([
          {
            event: 'message_start',
            data: {
              type: 'message_start',
              message: {
                id: 'msg_voice',
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
              delta: { type: 'text_delta', text: 'The meeting is scheduled for ' },
            },
          },
          {
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'tomorrow at three.' },
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
      operation: OperationType.VoiceRefine,
      docContent: 'Meeting notes from today.',
      cursorPos: 25,
      rawTranscript: 'um the meeting is like scheduled for uh tomorrow at three',
    });

    expect(result.model).toBe(ModelTarget.Sonnet);
    // VoiceRefine returns raw text, not JSON instructions
    expect(result.instructions).toEqual([]);
    expect(result.raw).toBe('The meeting is scheduled for tomorrow at three.');
  });

  it('should pass rawTranscript in the prompt variables', async () => {
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
              delta: { type: 'text_delta', text: 'Cleaned text.' },
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
      operation: OperationType.VoiceRefine,
      docContent: 'Some doc content.',
      cursorPos: 0,
      rawTranscript: 'um hello world uh',
    });

    expect(capturedBody).not.toBeNull();
    const messages = capturedBody!.messages as Array<{ content: string }>;
    expect(messages[0].content).toContain('um hello world uh');
  });

  it('should route VoiceRefine to Local for private documents', () => {
    const privateService = new DocumentAIServiceImpl({
      apiKey: 'test-key-123',
      isPrivate: true,
    });

    expect(privateService.route(OperationType.VoiceRefine)).toBe(ModelTarget.Local);
  });
});
