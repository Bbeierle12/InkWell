/**
 * Levenshtein edit distance for ghost text stability detection.
 */

/**
 * Compute the Levenshtein edit distance between two strings.
 * Used to determine whether a new ghost-text suggestion is "stable enough"
 * relative to the previous one.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Compute the Levenshtein ratio (distance / max length).
 * Returns a value between 0 (identical) and 1 (completely different).
 */
export function levenshteinRatio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 0;
  return levenshtein(a, b) / Math.max(a.length, b.length);
}
