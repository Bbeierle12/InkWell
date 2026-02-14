/**
 * Sliding Window
 *
 * Extracts a cursor-relative context window from the document,
 * ensuring the most relevant content is included within token limits.
 */

/** Approximate characters per token. */
const CHARS_PER_TOKEN = 4;

/**
 * Extract text around the cursor position within a token budget.
 *
 * The window is split evenly: half the token budget goes to text before
 * the cursor and half to text after. Text closest to the cursor is
 * preserved when trimming is needed.
 */
export function slidingWindow(
  content: string,
  cursorPos: number,
  maxTokens: number,
): { before: string; after: string } {
  // Handle empty content
  if (!content || maxTokens <= 0) {
    return { before: '', after: '' };
  }

  // Clamp cursor position to valid range
  const clampedCursor = Math.max(0, Math.min(cursorPos, content.length));

  // Calculate character budgets from token budget
  const halfTokens = Math.floor(maxTokens / 2);
  const beforeCharBudget = halfTokens * CHARS_PER_TOKEN;
  const afterCharBudget = halfTokens * CHARS_PER_TOKEN;

  // Extract text before cursor (keep text closest to cursor)
  const fullBefore = content.slice(0, clampedCursor);
  const before =
    fullBefore.length > beforeCharBudget
      ? fullBefore.slice(fullBefore.length - beforeCharBudget)
      : fullBefore;

  // Extract text after cursor (keep text closest to cursor)
  const fullAfter = content.slice(clampedCursor);
  const after =
    fullAfter.length > afterCharBudget
      ? fullAfter.slice(0, afterCharBudget)
      : fullAfter;

  return { before, after };
}
