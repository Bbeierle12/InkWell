/**
 * Semantic Similarity Scoring
 *
 * Compares AI output against golden references using
 * multiple similarity metrics.
 */

export interface ComparisonResult {
  overallScore: number;
  metrics: {
    exactMatch: boolean;
    cosineSimilarity: number;
    bleuScore: number;
    rougeL: number;
  };
}

/**
 * Tokenize a string by splitting on whitespace.
 */
function tokenize(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/);
}

/**
 * Build a term-frequency map from an array of tokens.
 */
function buildTfMap(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }
  return tf;
}

/**
 * Compute cosine similarity between two strings using TF vectors.
 * Returns 0 if either string is empty.
 */
function computeCosineSimilarity(output: string, golden: string): number {
  const tokensA = tokenize(output);
  const tokensB = tokenize(golden);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const tfA = buildTfMap(tokensA);
  const tfB = buildTfMap(tokensB);

  // Collect all unique terms
  const allTerms = new Set<string>([...tfA.keys(), ...tfB.keys()]);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const term of allTerms) {
    const a = tfA.get(term) ?? 0;
    const b = tfB.get(term) ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Extract n-grams from a token array.
 */
function getNgrams(tokens: string[], n: number): Map<string, number> {
  const ngrams = new Map<string, number>();
  for (let i = 0; i <= tokens.length - n; i++) {
    const ngram = tokens.slice(i, i + n).join(' ');
    ngrams.set(ngram, (ngrams.get(ngram) ?? 0) + 1);
  }
  return ngrams;
}

/**
 * Compute modified BLEU-4 score.
 * Uses clipped n-gram precision for n=1..4 with brevity penalty.
 * Returns 0 if no shared n-grams exist at any level.
 */
function computeBleuScore(output: string, golden: string): number {
  const outputTokens = tokenize(output);
  const goldenTokens = tokenize(golden);

  if (outputTokens.length === 0 || goldenTokens.length === 0) return 0;

  const maxN = 4;
  const precisions: number[] = [];

  for (let n = 1; n <= maxN; n++) {
    if (outputTokens.length < n) {
      precisions.push(0);
      continue;
    }

    const outputNgrams = getNgrams(outputTokens, n);
    const goldenNgrams = getNgrams(goldenTokens, n);

    let clippedCount = 0;
    let totalCount = 0;

    for (const [ngram, count] of outputNgrams) {
      const refCount = goldenNgrams.get(ngram) ?? 0;
      clippedCount += Math.min(count, refCount);
      totalCount += count;
    }

    if (totalCount === 0) {
      precisions.push(0);
    } else {
      precisions.push(clippedCount / totalCount);
    }
  }

  // If any precision is 0, the geometric mean will be 0
  if (precisions.some((p) => p === 0)) return 0;

  // Geometric mean of precisions (log space)
  const logAvg =
    precisions.reduce((sum, p) => sum + Math.log(p), 0) / maxN;

  // Brevity penalty
  const bp =
    outputTokens.length >= goldenTokens.length
      ? 1
      : Math.exp(1 - goldenTokens.length / outputTokens.length);

  return bp * Math.exp(logAvg);
}

/**
 * Compute the longest common subsequence length using DP.
 */
function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;

  // Use two rows for space efficiency
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    // Swap rows
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }

  return prev[n];
}

/**
 * Compute ROUGE-L score (F1 based on LCS).
 * Returns 0 if either string is empty.
 */
function computeRougeL(output: string, golden: string): number {
  const outputTokens = tokenize(output);
  const goldenTokens = tokenize(golden);

  if (outputTokens.length === 0 || goldenTokens.length === 0) return 0;

  const lcs = lcsLength(outputTokens, goldenTokens);

  if (lcs === 0) return 0;

  const precision = lcs / outputTokens.length;
  const recall = lcs / goldenTokens.length;

  // F1 score
  return (2 * precision * recall) / (precision + recall);
}

/**
 * Compare AI output against a golden reference.
 *
 * Computes multiple similarity metrics and returns a weighted overall score.
 *
 * Metrics:
 * - exactMatch: strict string equality after trimming
 * - cosineSimilarity: TF-based cosine similarity on whitespace tokens
 * - bleuScore: modified BLEU-4 with brevity penalty
 * - rougeL: ROUGE-L F1 via longest common subsequence
 *
 * Overall score: 0.1 * exactMatch + 0.3 * cosineSimilarity + 0.3 * bleuScore + 0.3 * rougeL
 * Clamped to [0, 1].
 */
export function compare(output: string, golden: string): ComparisonResult {
  const exactMatch = output.trim() === golden.trim();
  const cosineSimilarity = computeCosineSimilarity(output, golden);
  const bleuScore = computeBleuScore(output, golden);
  const rougeL = computeRougeL(output, golden);

  const rawOverall =
    0.1 * (exactMatch ? 1 : 0) +
    0.3 * cosineSimilarity +
    0.3 * bleuScore +
    0.3 * rougeL;

  const overallScore = Math.min(1, Math.max(0, rawOverall));

  return {
    overallScore,
    metrics: {
      exactMatch,
      cosineSimilarity,
      bleuScore,
      rougeL,
    },
  };
}
