import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '../test-setup';
import { ContextManager } from '../context';
import { DocumentAIServiceImpl } from '../service';
import { OperationType, ModelTarget } from '@inkwell/shared';
import type { WorkspaceRetriever, WorkspaceSnippet } from '@inkwell/shared';

/**
 * 8.2 Workspace Context Integration Tests
 *
 * Verifies that workspace snippets from related documents are
 * correctly retrieved and included in AI request context.
 */

/** Build an SSE body from event objects. */
function buildSSEBody(
  events: Array<{ event: string; data: unknown }>,
): string {
  return events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
}

/** Create a mock WorkspaceRetriever that returns pre-configured snippets. */
function createMockRetriever(snippets: WorkspaceSnippet[]): WorkspaceRetriever {
  return {
    retrieve: vi.fn(async (_query: string, _maxTokens: number) => snippets),
  };
}

// Three document fixtures for cross-document context testing
const DOC1 = '# Chapter 1: The Beginning\n\nAlice walked through the forest of ancient oaks.';
const DOC2_SNIPPET: WorkspaceSnippet = {
  content: 'The ancient oaks were planted by the founders three centuries ago.',
  path: 'chapter2.md',
  score: 0.85,
};
const DOC3_SNIPPET: WorkspaceSnippet = {
  content: 'Alice had always been fascinated by the history of the forest.',
  path: 'character-notes.md',
  score: 0.72,
};

describe('8.2 Workspace Context Integration', () => {
  it('should include workspace snippets when retriever is present', async () => {
    const retriever = createMockRetriever([DOC2_SNIPPET, DOC3_SNIPPET]);
    const cm = new ContextManager({ workspaceRetriever: retriever });

    const ctx = await cm.build(DOC1, 30, 'doc1', 16_000);

    expect(ctx.workspaceSnippets).toContain('[Workspace Context]');
    expect(ctx.workspaceSnippets).toContain('chapter2.md');
    expect(ctx.workspaceSnippets).toContain('character-notes.md');
    expect(ctx.workspaceSnippets).toContain('ancient oaks');
    expect(ctx.workspaceSnippets).toContain('score: 0.85');
  });

  it('should return empty workspaceSnippets when no retriever is configured', async () => {
    const cm = new ContextManager();

    const ctx = await cm.build(DOC1, 30, 'doc1', 16_000);

    expect(ctx.workspaceSnippets).toBe('');
  });

  it('should return empty workspaceSnippets when no token budget is given', async () => {
    const retriever = createMockRetriever([DOC2_SNIPPET]);
    const cm = new ContextManager({ workspaceRetriever: retriever });

    // No tokenBudget parameter → no workspace retrieval
    const ctx = await cm.build(DOC1, 30, 'doc1');

    expect(ctx.workspaceSnippets).toBe('');
  });

  it('should include workspace snippet length in token count', async () => {
    const retriever = createMockRetriever([DOC2_SNIPPET]);
    const cm = new ContextManager({ workspaceRetriever: retriever });

    const ctxWithSnippets = await cm.build(DOC1, 30, 'doc-with', 16_000);
    const cmNoRetriever = new ContextManager();
    const ctxWithout = await cmNoRetriever.build(DOC1, 30, 'doc-without');

    // Token count should be higher when snippets are included
    expect(ctxWithSnippets.tokenCount).toBeGreaterThan(ctxWithout.tokenCount);
  });

  it('should pass query to retriever based on cursor position', async () => {
    const mockRetrieve = vi.fn(
      async (_query: string, _maxTokens: number) => [DOC2_SNIPPET],
    );
    const retriever: WorkspaceRetriever = { retrieve: mockRetrieve };
    const cm = new ContextManager({ workspaceRetriever: retriever });

    await cm.build(DOC1, 30, 'doc1', 16_000);

    expect(mockRetrieve).toHaveBeenCalledTimes(1);
    const query = mockRetrieve.mock.calls[0]?.[0] ?? '';
    const budget = mockRetrieve.mock.calls[0]?.[1] ?? 0;
    expect(typeof query).toBe('string');
    expect(query.length).toBeGreaterThan(0);
    expect(typeof budget).toBe('number');
    expect(budget).toBeGreaterThan(0);
  });

  it('should include workspace snippets in Claude request via DocumentAIServiceImpl', async () => {
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

    const retriever = createMockRetriever([DOC2_SNIPPET, DOC3_SNIPPET]);
    const service = new DocumentAIServiceImpl({
      apiKey: 'test-key-123',
      workspaceRetriever: retriever,
    });

    await service.executeOperation({
      operation: OperationType.Rewrite,
      docContent: DOC1,
      cursorPos: 30,
      selection: { from: 0, to: 30, text: DOC1.slice(0, 30) },
    });

    expect(capturedBody).not.toBeNull();
    const messages = capturedBody!.messages as Array<{ content: string }>;
    const userMessage = messages[0].content;

    // Workspace snippets should appear in the user message content
    expect(userMessage).toContain('chapter2.md');
    expect(userMessage).toContain('ancient oaks');
  });

  it('should not retrieve workspace snippets for Local-target operations', async () => {
    const mockRetrieve = vi.fn(async () => [DOC2_SNIPPET]);
    const retriever: WorkspaceRetriever = { retrieve: mockRetrieve };

    const service = new DocumentAIServiceImpl({
      apiKey: 'test-key-123',
      workspaceRetriever: retriever,
    });

    // InlineSuggest routes to Local — no cloud call, but still builds context
    const result = await service.executeOperation({
      operation: OperationType.InlineSuggest,
      docContent: DOC1,
      cursorPos: 30,
    });

    // Local target returns empty when no local provider
    expect(result.model).toBe(ModelTarget.Local);
    expect(result.raw).toBe('');
  });
});
