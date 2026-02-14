/**
 * Stream Handler
 *
 * SSE parsing with error and abort handling for Claude API streams.
 * Implements SSE parsing directly without eventsource-parser.
 */

import { STREAM_TIMEOUT_MS } from '@inkwell/shared';

export interface StreamEvent {
  type:
    | 'content_block_delta'
    | 'message_start'
    | 'message_stop'
    | 'content_block_start'
    | 'content_block_stop'
    | 'error'
    | 'ping';
  data?: unknown;
}

/**
 * Error thrown when an error event is received mid-stream.
 */
export class StreamError extends Error {
  constructor(
    message: string,
    public readonly errorType: string,
  ) {
    super(message);
    this.name = 'StreamError';
  }
}

/**
 * Error thrown when the stream times out (no events for STREAM_TIMEOUT_MS).
 */
export class StreamTimeoutError extends Error {
  constructor(timeoutMs: number = STREAM_TIMEOUT_MS) {
    super(`Stream timed out after ${timeoutMs}ms with no events`);
    this.name = 'StreamTimeoutError';
  }
}

/**
 * Parse an SSE stream from the Claude API.
 *
 * Reads the response body as a ReadableStream of Uint8Array chunks,
 * parses SSE-formatted lines (event: / data:), and yields StreamEvent objects.
 *
 * Handles:
 * - AbortSignal for cancellation
 * - Timeout detection (STREAM_TIMEOUT_MS of silence)
 * - Error events mid-stream
 * - Streams that end without message_stop
 * - Abrupt termination (no more events)
 */
export async function* parseSSEStream(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent, void, unknown> {
  const body = response.body;
  if (!body) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  let currentEvent = '';
  let currentData = '';
  let lastEventTime = Date.now();

  // Track the pending read promise so we can suppress its rejection on cancel
  let pendingRead: Promise<ReadableStreamReadResult<Uint8Array>> | null = null;

  try {
    while (true) {
      // Check abort signal
      if (signal?.aborted) {
        return;
      }

      // Check timeout
      const elapsed = Date.now() - lastEventTime;
      if (elapsed >= STREAM_TIMEOUT_MS) {
        throw new StreamTimeoutError();
      }

      // Create a timeout-aware read: we race the read against a timeout
      const timeoutRemaining = STREAM_TIMEOUT_MS - elapsed;
      pendingRead = reader.read();
      // Suppress unhandled rejection from the read if we cancel before it completes
      pendingRead.catch(() => {});
      const readResult = await Promise.race([
        pendingRead,
        createTimeoutPromise(timeoutRemaining),
        ...(signal ? [createAbortPromise(signal)] : []),
      ]);
      pendingRead = null;

      // Handle abort result
      if (readResult && 'aborted' in readResult) {
        return;
      }

      // Handle timeout result
      if (readResult && 'timedOut' in readResult) {
        throw new StreamTimeoutError();
      }

      const { done, value } = readResult as ReadableStreamReadResult<Uint8Array>;

      if (done) {
        // Stream ended — process any remaining buffer
        if (buffer.trim()) {
          const event = processBufferedEvent(currentEvent, currentData, buffer);
          if (event) {
            yield event;
          }
        }
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      lastEventTime = Date.now();

      // Process complete lines from the buffer
      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '') {
          // Empty line = end of event
          if (currentData) {
            const event = parseEvent(currentEvent, currentData);
            if (event) {
              if (event.type === 'error') {
                // Yield the error event, then throw
                const errorData = event.data as {
                  error?: { type: string; message: string };
                };
                const errType = errorData?.error?.type ?? 'unknown_error';
                const errMsg =
                  errorData?.error?.message ?? 'Unknown stream error';
                throw new StreamError(errMsg, errType);
              }
              yield event;
            }
            currentEvent = '';
            currentData = '';
          }
          continue;
        }

        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim();
        } else if (trimmed.startsWith('data:')) {
          currentData = trimmed.slice(5).trim();
        }
        // Ignore other lines (comments starting with :, etc.)
      }
    }
  } finally {
    try {
      reader.cancel();
    } catch {
      // Ignore cancel errors
    }
  }
}

function parseEvent(eventType: string, data: string): StreamEvent | null {
  try {
    const parsed = JSON.parse(data);
    const type = eventType || parsed?.type;

    switch (type) {
      case 'message_start':
        return { type: 'message_start', data: parsed };
      case 'message_stop':
        return { type: 'message_stop', data: parsed };
      case 'content_block_start':
        return { type: 'content_block_start', data: parsed };
      case 'content_block_stop':
        return { type: 'content_block_stop', data: parsed };
      case 'content_block_delta':
        return { type: 'content_block_delta', data: parsed };
      case 'error':
        return { type: 'error', data: parsed };
      case 'ping':
        return { type: 'ping', data: parsed };
      default:
        // Unknown event type — skip
        return null;
    }
  } catch {
    // Malformed JSON — skip this event
    return null;
  }
}

function processBufferedEvent(
  currentEvent: string,
  currentData: string,
  buffer: string,
): StreamEvent | null {
  // Try to extract event/data from remaining buffer
  let event = currentEvent;
  let data = currentData;

  const lines = buffer.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('event:')) {
      event = trimmed.slice(6).trim();
    } else if (trimmed.startsWith('data:')) {
      data = trimmed.slice(5).trim();
    }
  }

  if (data) {
    return parseEvent(event, data);
  }
  return null;
}

function createTimeoutPromise(
  ms: number,
): Promise<{ timedOut: true }> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ timedOut: true }), ms);
  });
}

function createAbortPromise(
  signal: AbortSignal,
): Promise<{ aborted: true }> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve({ aborted: true });
      return;
    }
    signal.addEventListener('abort', () => resolve({ aborted: true }), {
      once: true,
    });
  });
}
