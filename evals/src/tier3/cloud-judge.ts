/**
 * Tier 3 — Cloud Judge (Claude-as-Judge)
 *
 * Uses Claude as an automated judge for highest-quality evaluation.
 * Runs on merge to main and nightly.
 */

export interface CloudJudgeResult {
  score: number;
  reasoning: string;
  criteria: Record<string, number>;
  model: string;
}

/**
 * Run the cloud judge (Claude) on an AI output against golden reference.
 */
export async function cloudJudge(
  input: string,
  output: string,
  golden: string,
  criteria: string[],
): Promise<CloudJudgeResult> {
  // TODO: implement
  // - Call Claude API with judge prompt
  // - Parse structured response
  throw new Error('not implemented');
}
