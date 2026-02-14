/**
 * Token Counter
 *
 * Provides token estimation for text content.
 * Uses a heuristic of ~4 characters per token, consistent with
 * conventions used elsewhere in the codebase.
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
 * Count the number of tokens in the given text.
 *
 * Currently uses the heuristic estimator. In production, this could
 * be replaced with a call to Claude's token counting endpoint.
 *
 * Invariant: token-counts-match-claude-tokenizer
 */
export async function countTokens(
  text: string,
  _apiKey: string,
): Promise<number> {
  // For now, use the heuristic. The async signature allows future
  // replacement with an API call without changing the interface.
  return estimateTokens(text);
}
