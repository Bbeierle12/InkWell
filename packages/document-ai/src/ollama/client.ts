/**
 * Ollama API Client
 *
 * Streaming client for the Ollama local inference API (/api/chat).
 * Produces the same AsyncGenerator<string> interface as ClaudeClient,
 * making it a drop-in transport swap.
 */

import type { OllamaModelInfo } from '@inkwell/shared';

export interface OllamaClientOptions {
  baseUrl?: string;
  model: string;
}

/**
 * Error thrown for non-OK HTTP responses from the Ollama API.
 */
export class OllamaAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errorType: string,
  ) {
    super(message);
    this.name = 'OllamaAPIError';
  }
}

export class OllamaClient {
  private baseUrl: string;
  private model: string;

  constructor(options: OllamaClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'http://localhost:11434').replace(/\/+$/, '');
    this.model = options.model;
  }

  /**
   * Send a streaming chat request to the Ollama API.
   *
   * Yields text deltas (strings) as they arrive from the newline-delimited
   * JSON stream. Interface-compatible with ClaudeClient.stream().
   */
  async *stream(
    messages: Array<{ role: string; content: string }>,
    options?: {
      model?: string;
      maxTokens?: number;
      signal?: AbortSignal;
      stopSequences?: string[];
      system?: string;
      // Accepted for interface compatibility with ClaudeClient; ignored.
      systemCacheControl?: boolean;
    },
  ): AsyncGenerator<string, void, unknown> {
    const model = options?.model ?? this.model;
    const signal = options?.signal;

    // Ollama expects system as a message at the front of the array
    const ollamaMessages: Array<{ role: string; content: string }> = [];
    if (options?.system) {
      ollamaMessages.push({ role: 'system', content: options.system });
    }
    ollamaMessages.push(...messages);

    const requestBody: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream: true,
    };

    // Map maxTokens to Ollama's num_predict option
    const ollamaOptions: Record<string, unknown> = {};
    if (options?.maxTokens) {
      ollamaOptions.num_predict = options.maxTokens;
    }
    if (options?.stopSequences && options.stopSequences.length > 0) {
      ollamaOptions.stop = options.stopSequences;
    }
    if (Object.keys(ollamaOptions).length > 0) {
      requestBody.options = ollamaOptions;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      let errorMessage = `Ollama API error: HTTP ${response.status}`;
      try {
        const errorBody = await response.json() as { error?: string };
        if (errorBody?.error) {
          errorMessage = errorBody.error;
        }
      } catch {
        // Could not parse error body — use defaults
      }
      throw new OllamaAPIError(errorMessage, response.status, 'api_error');
    }

    if (!response.body) {
      throw new OllamaAPIError('No response body from Ollama', 0, 'stream_error');
    }

    // Parse Ollama's newline-delimited JSON stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (signal?.aborted) return;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (signal?.aborted) return;

          try {
            const parsed = JSON.parse(trimmed) as {
              message?: { content?: string };
              done?: boolean;
              error?: string;
            };

            if (parsed.error) {
              throw new OllamaAPIError(parsed.error, 200, 'stream_error');
            }

            if (parsed.message?.content) {
              yield parsed.message.content;
            }

            if (parsed.done) return;
          } catch (e) {
            if (e instanceof OllamaAPIError) throw e;
            // Skip malformed lines
          }
        }
      }

      // Process any remaining buffer content
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as {
            message?: { content?: string };
            done?: boolean;
            error?: string;
          };
          if (parsed.error) {
            throw new OllamaAPIError(parsed.error, 200, 'stream_error');
          }
          if (parsed.message?.content) {
            yield parsed.message.content;
          }
        } catch (e) {
          if (e instanceof OllamaAPIError) throw e;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Fetch the list of locally available models from Ollama.
   */
  static async listModels(baseUrl: string): Promise<OllamaModelInfo[]> {
    const url = baseUrl.replace(/\/+$/, '');
    const response = await fetch(`${url}/api/tags`);
    if (!response.ok) {
      throw new OllamaAPIError(
        `Failed to list models: HTTP ${response.status}`,
        response.status,
        'api_error',
      );
    }
    const body = await response.json() as { models?: OllamaModelInfo[] };
    return body.models ?? [];
  }

  /**
   * Check if the Ollama server is reachable.
   */
  static async checkHealth(baseUrl: string): Promise<boolean> {
    const url = baseUrl.replace(/\/+$/, '');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${url}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      return response.ok;
    } catch {
      return false;
    }
  }
}
