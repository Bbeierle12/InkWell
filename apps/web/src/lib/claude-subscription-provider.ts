import type { ModelTarget } from '@inkwell/shared';
import { invokeClaudeViaSubscription } from './tauri-bridge';

interface CloudStreamRequest {
  model: ModelTarget;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
  stopSequences?: string[];
  system?: string;
  systemCacheControl?: boolean;
}

/**
 * Cloud stream provider backed by Tauri auth transport.
 *
 * Current implementation performs a non-streaming invoke in desktop and yields
 * the final text as one chunk.
 */
export async function* streamClaudeViaSubscription(
  request: CloudStreamRequest,
): AsyncGenerator<string, void, unknown> {
  const text = await invokeClaudeViaSubscription({
    model: request.model,
    messages: request.messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    max_tokens: request.maxTokens ?? 4096,
    stop_sequences: request.stopSequences,
    system: request.system,
    system_cache_control: request.systemCacheControl,
  });

  if (text) {
    yield text;
  }
}
