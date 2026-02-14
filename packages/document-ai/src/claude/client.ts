/**
 * Claude API Client
 *
 * Wrapper around the Anthropic Messages API with streaming support.
 */

import { parseSSEStream, StreamError, StreamTimeoutError } from './stream-handler';
import type { StreamEvent } from './stream-handler';

export interface ClaudeClientOptions {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

/**
 * Error thrown for non-OK HTTP responses from the Claude API.
 */
export class ClaudeAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errorType: string,
  ) {
    super(message);
    this.name = 'ClaudeAPIError';
  }
}

export { StreamError, StreamTimeoutError };

export class ClaudeClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(options: ClaudeClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
    this.defaultModel = options.defaultModel ?? 'claude-sonnet-4-5-20250929';
  }

  /**
   * Send a streaming message request to the Claude API.
   *
   * Yields text deltas (strings) as they arrive from the API.
   * Handles abort signal propagation and stream cleanup.
   *
   * Invariant: no-orphaned-streams-after-close
   */
  async *stream(
    messages: Array<{ role: string; content: string }>,
    options?: { model?: string; maxTokens?: number; signal?: AbortSignal; stopSequences?: string[] },
  ): AsyncGenerator<string, void, unknown> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 4096;
    const signal = options?.signal;

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
      stream: true,
    };

    if (options?.stopSequences) {
      requestBody.stop_sequences = options.stopSequences;
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      // Try to parse the error response body for details
      let errorType = 'api_error';
      let errorMessage = `Claude API error: HTTP ${response.status}`;

      try {
        const errorBody = await response.json() as {
          type?: string;
          error?: { type: string; message: string };
        };
        if (errorBody?.error) {
          errorType = errorBody.error.type;
          errorMessage = errorBody.error.message;
        }
      } catch {
        // Could not parse error body — use defaults
      }

      throw new ClaudeAPIError(errorMessage, response.status, errorType);
    }

    // Parse the SSE stream and yield text deltas
    const sseStream = parseSSEStream(response, signal);

    try {
      for await (const event of sseStream) {
        if (signal?.aborted) {
          return;
        }

        if (event.type === 'content_block_delta') {
          const data = event.data as {
            delta?: { type: string; text?: string };
          };
          if (data?.delta?.type === 'text_delta' && data.delta.text) {
            yield data.delta.text;
          }
        }

        if (event.type === 'message_stop') {
          return;
        }
      }
    } catch (error) {
      // Re-throw stream errors and timeout errors
      if (error instanceof StreamError) {
        throw new ClaudeAPIError(
          error.message,
          200,
          error.errorType,
        );
      }
      throw error;
    }
    // Stream ended without message_stop — just return (partial text already yielded)
  }
}
