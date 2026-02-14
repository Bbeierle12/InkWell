/**
 * Tier 2 — Local Judge
 *
 * Uses a local 8B model as an automated judge to evaluate AI output quality.
 * Faster than cloud judge, suitable for merge-to-main CI.
 */

export interface JudgeResult {
  score: number; // 0-10
  reasoning: string;
  criteria: Record<string, number>;
}

/**
 * Run the local judge on an AI output against golden reference.
 */
export async function localJudge(
  input: string,
  output: string,
  golden: string,
  criteria: string[],
): Promise<JudgeResult> {
  // TODO: implement
  // - Load local judge model
  // - Format judge prompt with input/output/golden
  // - Parse judge response
  throw new Error('not implemented');
}
