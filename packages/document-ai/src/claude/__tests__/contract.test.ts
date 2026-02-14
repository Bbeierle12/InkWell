import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '../../test-setup';
import { ClaudeClient } from '../client';

/**
 * Helper: Convert an array of SSE event objects into an SSE-formatted string.
 */
function buildSSEBody(
  events: Array<{ event: string; data: unknown }>,
): string {
  return events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
}


/**
 * 4.1 Claude API Contract Tests
 */
describe('4.1 Claude API Contract', () => {
  const client = new ClaudeClient({ apiKey: 'test-key-123' });

  it('should send correctly formatted messages request', async () => {
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
            event: 'content_block_start',
            data: {
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'text', text: '' },
            },
          },
          {
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'Hello' },
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

    const messages = [{ role: 'user', content: 'Say hello' }];
    const gen = client.stream(messages, { maxTokens: 1024 });
    // Consume generator to trigger the request
    const chunks: string[] = [];
    for await (const chunk of gen) {
      chunks.push(chunk);
    }

    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.model).toBe('claude-sonnet-4-5-20250929');
    expect(capturedBody!.messages).toEqual([{ role: 'user', content: 'Say hello' }]);
    expect(capturedBody!.max_tokens).toBe(1024);
    expect(capturedBody!.stream).toBe(true);
  });

  it('should parse streaming content_block_delta events', async () => {
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
            event: 'content_block_start',
            data: {
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'text', text: '' },
            },
          },
          {
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'Hello' },
            },
          },
          {
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: ' world' },
            },
          },
          {
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: '!' },
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

    const chunks: string[] = [];
    for await (const chunk of client.stream([{ role: 'user', content: 'Hi' }])) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello', ' world', '!']);
    expect(chunks.join('')).toBe('Hello world!');
  });

  it('should handle message_stop event', async () => {
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
            event: 'content_block_start',
            data: {
              type: 'content_block_start',
              index: 0,
              content_block: { type: 'text', text: '' },
            },
          },
          {
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: 'Done' },
            },
          },
          {
            event: 'content_block_stop',
            data: { type: 'content_block_stop', index: 0 },
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

    const chunks: string[] = [];
    for await (const chunk of client.stream([{ role: 'user', content: 'Test' }])) {
      chunks.push(chunk);
    }

    // Generator should have completed normally after message_stop
    expect(chunks).toEqual(['Done']);
  });

  it('should include required headers (x-api-key, anthropic-version)', async () => {
    let capturedHeaders: Record<string, string> = {};

    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        capturedHeaders = {
          'x-api-key': request.headers.get('x-api-key') ?? '',
          'anthropic-version': request.headers.get('anthropic-version') ?? '',
          'content-type': request.headers.get('content-type') ?? '',
        };

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
              delta: { type: 'text_delta', text: 'OK' },
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

    const apiKeyClient = new ClaudeClient({ apiKey: 'sk-ant-test-key' });
    const chunks: string[] = [];
    for await (const chunk of apiKeyClient.stream([{ role: 'user', content: 'Hi' }])) {
      chunks.push(chunk);
    }

    expect(capturedHeaders['x-api-key']).toBe('sk-ant-test-key');
    expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');
    expect(capturedHeaders['content-type']).toBe('application/json');
  });

  it('should propagate abort signal and stop yielding', async () => {
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
              delta: { type: 'text_delta', text: 'First' },
            },
          },
          {
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: ' Second' },
            },
          },
          {
            event: 'content_block_delta',
            data: {
              type: 'content_block_delta',
              index: 0,
              delta: { type: 'text_delta', text: ' Third' },
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

    const controller = new AbortController();
    const gen = client.stream(
      [{ role: 'user', content: 'Test' }],
      { signal: controller.signal },
    );

    const chunks: string[] = [];
    for await (const chunk of gen) {
      chunks.push(chunk);
      if (chunks.length === 1) {
        controller.abort();
      }
    }

    // Should have gotten at most the first chunk before abort took effect
    expect(chunks.length).toBeLessThanOrEqual(2);
    expect(chunks[0]).toBe('First');
  });

  it('should include cache_control on system message when systemCacheControl is true', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    let capturedBetaHeader: string | null = null;

    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        capturedBetaHeader = request.headers.get('anthropic-beta');

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
              delta: { type: 'text_delta', text: 'OK' },
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

    const chunks: string[] = [];
    for await (const chunk of client.stream(
      [{ role: 'user', content: 'Hi' }],
      {
        system: 'You are a helpful assistant.',
        systemCacheControl: true,
      },
    )) {
      chunks.push(chunk);
    }

    expect(capturedBody).not.toBeNull();

    // system should be an array with cache_control
    const system = capturedBody!.system as Array<{
      type: string;
      text: string;
      cache_control: { type: string };
    }>;
    expect(Array.isArray(system)).toBe(true);
    expect(system).toHaveLength(1);
    expect(system[0].type).toBe('text');
    expect(system[0].text).toBe('You are a helpful assistant.');
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' });

    // anthropic-beta header should be present
    expect(capturedBetaHeader).toBe('prompt-caching-2024-07-31');
  });
});
