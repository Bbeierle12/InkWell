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
 * Helper: Build a complete SSE stream with the given stop reason.
 */
function buildStreamWithStopReason(
  textChunks: string[],
  stopReason: string,
): string {
  const events: Array<{ event: string; data: unknown }> = [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: 'msg_stop_test',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5-20250929',
          stop_reason: null,
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
  ];

  for (const text of textChunks) {
    events.push({
      event: 'content_block_delta',
      data: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text },
      },
    });
  }

  events.push({
    event: 'content_block_stop',
    data: { type: 'content_block_stop', index: 0 },
  });

  events.push({
    event: 'message_delta',
    data: {
      type: 'message_delta',
      delta: { stop_reason: stopReason },
      usage: { output_tokens: 25 },
    },
  });

  events.push({
    event: 'message_stop',
    data: { type: 'message_stop' },
  });

  return buildSSEBody(events);
}

/**
 * 4.1 Stop Reason Handling Tests
 */
describe('4.1 Stop Reason Handling', () => {
  const client = new ClaudeClient({ apiKey: 'test-key' });

  it('should handle end_turn stop reason', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        const sseBody = buildStreamWithStopReason(
          ['The quarterly results ', 'show strong growth.'],
          'end_turn',
        );
        return new HttpResponse(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const chunks: string[] = [];
    for await (const chunk of client.stream([{ role: 'user', content: 'Summarize' }])) {
      chunks.push(chunk);
    }

    // Generator should complete normally, all text yielded
    expect(chunks).toEqual(['The quarterly results ', 'show strong growth.']);
    expect(chunks.join('')).toBe('The quarterly results show strong growth.');
  });

  it('should handle max_tokens stop reason', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        const sseBody = buildStreamWithStopReason(
          ['The quarterly results show that the company has achieved significant'],
          'max_tokens',
        );
        return new HttpResponse(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const chunks: string[] = [];
    for await (const chunk of client.stream([{ role: 'user', content: 'Expand' }], { maxTokens: 10 })) {
      chunks.push(chunk);
    }

    // Generator should complete, text yielded (truncated due to max_tokens)
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toBe(
      'The quarterly results show that the company has achieved significant',
    );
  });

  it('should handle stop_sequence stop reason', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        const sseBody = buildStreamWithStopReason(
          ['Here is the summary:\n', 'Revenue grew 15%.'],
          'stop_sequence',
        );
        return new HttpResponse(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const chunks: string[] = [];
    for await (const chunk of client.stream([{ role: 'user', content: 'Summarize' }])) {
      chunks.push(chunk);
    }

    // Generator should complete normally
    expect(chunks).toEqual(['Here is the summary:\n', 'Revenue grew 15%.']);
    expect(chunks.join('')).toBe('Here is the summary:\nRevenue grew 15%.');
  });
});
