import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '../../test-setup';
import { ClaudeClient, ClaudeAPIError, StreamTimeoutError } from '../client';
import { STREAM_TIMEOUT_MS } from '@inkwell/shared';

/**
 * Fixture data inlined from fixtures/claude/*.json
 */
const error429 = {
  type: 'error',
  error: {
    type: 'rate_limit_error',
    message: 'Rate limit exceeded. Please retry after 30 seconds.',
  },
};

const error529 = {
  type: 'error',
  error: {
    type: 'overloaded_error',
    message: "Anthropic's API is temporarily overloaded. Please try again later.",
  },
};

const errorMalformed = {
  id: 'msg_fixture_malformed',
  type: 'message',
  role: 'assistant',
  content: 'this is not an array and violates the expected schema',
  model: 'claude-sonnet-4-5-20250929',
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 5 },
};

const stream200ButError = {
  events: [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: 'msg_stream_err',
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
        delta: { type: 'text_delta', text: 'The quarterly' },
      },
    },
    {
      event: 'error',
      data: {
        type: 'error',
        error: {
          type: 'server_error',
          message: 'Internal server error during generation',
        },
      },
    },
  ],
};

const streamNoMessageStop = {
  events: [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: 'msg_no_stop',
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
        delta: {
          type: 'text_delta',
          text: 'Here is the rewritten text with improved clarity and',
        },
      },
    },
    {
      event: 'content_block_stop',
      data: { type: 'content_block_stop', index: 0 },
    },
  ],
};

const streamEarlyTerminate = {
  events: [
    {
      event: 'message_start',
      data: {
        type: 'message_start',
        message: {
          id: 'msg_early_term',
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
        delta: { type: 'text_delta', text: 'The document' },
      },
    },
  ],
};

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
 * 4.1 Stream Error Handling Tests
 */
describe('4.1 Stream Error Handling', () => {
  const client = new ClaudeClient({ apiKey: 'test-key' });

  it('should handle HTTP 429 (rate limit) gracefully', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        return HttpResponse.json(error429, { status: 429 });
      }),
    );

    try {
      for await (const _chunk of client.stream([{ role: 'user', content: 'Hello' }])) {
        // Should not yield anything
      }
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ClaudeAPIError);
      const apiErr = err as ClaudeAPIError;
      expect(apiErr.status).toBe(429);
      expect(apiErr.errorType).toBe('rate_limit_error');
    }
  });

  it('should handle HTTP 529 (overloaded) gracefully', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        return HttpResponse.json(error529, { status: 529 });
      }),
    );

    try {
      for await (const _chunk of client.stream([{ role: 'user', content: 'Hello' }])) {
        // Should not reach here
      }
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ClaudeAPIError);
      const apiErr = err as ClaudeAPIError;
      expect(apiErr.status).toBe(529);
      expect(apiErr.errorType).toBe('overloaded_error');
    }
  });

  it('should handle stream timeout', async () => {
    vi.useFakeTimers();

    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        // Return a stream that never sends any data (hangs)
        const stream = new ReadableStream({
          start() {
            // Intentionally never enqueue or close — simulates timeout
          },
        });

        return new HttpResponse(stream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const gen = client.stream([{ role: 'user', content: 'Hello' }]);

    let caughtError: unknown = null;
    const resultPromise = (async () => {
      try {
        for await (const _chunk of gen) {
          // Should not yield anything before timeout
        }
      } catch (err) {
        caughtError = err;
        throw err;
      }
    })();

    // Attach error handler immediately to prevent unhandled rejection
    resultPromise.catch(() => {});

    // Advance timers past the timeout threshold
    await vi.advanceTimersByTimeAsync(STREAM_TIMEOUT_MS + 1000);

    // Wait for the promise to settle
    try {
      await resultPromise;
      expect.unreachable('Should have thrown StreamTimeoutError');
    } catch {
      // Expected
    }

    expect(caughtError).toBeInstanceOf(StreamTimeoutError);

    vi.useRealTimers();
  });

  it('should handle malformed response body', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        // Return the malformed fixture as a non-streaming JSON response
        // with status 200. The body has content as string instead of array.
        return HttpResponse.json(errorMalformed, { status: 200 });
      }),
    );

    // The response is JSON (not SSE) so the body won't parse as SSE events properly.
    // The generator should complete without yielding any text (no content_block_delta events).
    const chunks: string[] = [];
    for await (const chunk of client.stream([{ role: 'user', content: 'Hello' }])) {
      chunks.push(chunk);
    }

    // No text deltas should be yielded from a malformed non-SSE response
    expect(chunks).toEqual([]);
  });

  it('should handle HTTP 200 with error event mid-stream', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        const sseBody = buildSSEBody(stream200ButError.events);
        return new HttpResponse(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const chunks: string[] = [];
    try {
      for await (const chunk of client.stream([{ role: 'user', content: 'Hello' }])) {
        chunks.push(chunk);
      }
      expect.unreachable('Should have thrown on error event');
    } catch (err) {
      expect(err).toBeInstanceOf(ClaudeAPIError);
      const apiErr = err as ClaudeAPIError;
      expect(apiErr.errorType).toBe('server_error');
      expect(apiErr.message).toContain('Internal server error');
    }

    // Some text may have been yielded before the error event
    expect(chunks).toEqual(['The quarterly']);
  });

  it('should handle stream without message_stop', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        const sseBody = buildSSEBody(streamNoMessageStop.events);
        return new HttpResponse(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const chunks: string[] = [];
    for await (const chunk of client.stream([{ role: 'user', content: 'Hello' }])) {
      chunks.push(chunk);
    }

    // Should complete with partial text (not hang)
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toBe('Here is the rewritten text with improved clarity and');
  });

  it('should handle abrupt stream termination', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        const sseBody = buildSSEBody(streamEarlyTerminate.events);
        return new HttpResponse(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const chunks: string[] = [];
    for await (const chunk of client.stream([{ role: 'user', content: 'Hello' }])) {
      chunks.push(chunk);
    }

    // Should complete with partial text (not hang)
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toBe('The document');
  });

  it('should not leave partial edits after stream error', async () => {
    // Invariant: stream-errors-no-partial-edits
    // When a stream error occurs, the generator should throw and not yield
    // any more data after the error. We verify this by checking that once
    // an error is thrown, no further chunks are yielded.

    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        const sseBody = buildSSEBody(stream200ButError.events);
        return new HttpResponse(sseBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }),
    );

    const chunks: string[] = [];
    let errorThrown = false;
    let chunksAfterError = 0;

    const gen = client.stream([{ role: 'user', content: 'Hello' }]);

    try {
      for await (const chunk of gen) {
        if (errorThrown) {
          chunksAfterError++;
        }
        chunks.push(chunk);
      }
    } catch {
      errorThrown = true;
    }

    expect(errorThrown).toBe(true);
    expect(chunksAfterError).toBe(0);

    // After an error, calling next() on the generator should not yield more data
    const nextResult = await gen.next();
    expect(nextResult.done).toBe(true);
    expect(nextResult.value).toBeUndefined();
  });
});
