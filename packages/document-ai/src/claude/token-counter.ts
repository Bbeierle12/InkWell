/**
 * Token Counter
 *
 * Provides token estimation and real token counting via the Claude API.
 * Falls back to a heuristic of ~4 characters per token when the API is unavailable.
 */

/**
 * Estimate the number of tokens in the given text using a heuristic.
 *
 * Uses approximately 4 characters per token, which is a common
 * approximation for English text with Claude's tokenizer.
 *
 * This is a synchronous operation that does not require an API call.
 */
export function estimateTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

/**
 * Count the number of tokens in the given text using the Claude API.
 *
 * Calls the /v1/messages/count_tokens endpoint for accurate counting.
 * Falls back to the heuristic estimator on any error (network, non-OK response).
 *
 * Invariant: token-counts-match-claude-tokenizer
 */
export async function countTokens(
  text: string,
  apiKey: string,
  options?: { baseUrl?: string; model?: string },
): Promise<number> {
  const baseUrl = options?.baseUrl ?? 'https://api.anthropic.com';
  const model = options?.model ?? 'claude-sonnet-4-5-20250929';

  try {
    const response = await fetch(`${baseUrl}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: text }],
      }),
    });

    if (!response.ok) {
      return estimateTokens(text);
    }

    const body = (await response.json()) as { input_tokens: number };
    return body.input_tokens;
  } catch {
    return estimateTokens(text);
  }
}
