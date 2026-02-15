/**
 * Tier 2 — Local Judge (Deterministic Heuristic Scoring)
 *
 * Since no local LLM model is available in CI, this implements enhanced
 * deterministic scoring using the compare() metrics plus operation-specific
 * heuristics. Runs in merge-to-main CI.
 */

import { compare } from '../compare';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export interface JudgeResult {
  score: number; // 0-10
  reasoning: string;
  criteria: Record<string, number>;
}

interface JudgePrompts {
  systemPrompt: string;
  criteria: Record<string, string[]>;
}

const promptsPath = resolve(__dirname, 'fixtures/judge-prompts.json');
const judgePrompts: JudgePrompts = JSON.parse(readFileSync(promptsPath, 'utf-8'));

/**
 * Count sentences in a text (split on period/exclamation/question mark followed by space or end).
 */
function countSentences(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  return Math.max(1, sentences.length);
}

/**
 * Average words per sentence.
 */
function avgWordsPerSentence(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0);
  return totalWords / sentences.length;
}

/**
 * Heuristic scorer functions keyed by criterion name.
 * Each returns a score from 0 to 10.
 */
const scorers: Record<string, (input: string, output: string, golden: string) => number> = {
  // Rewrite criteria
  tone_preservation: (_input, output, golden) => {
    const comparison = compare(output, golden);
    return Math.min(10, (comparison.metrics.cosineSimilarity + comparison.metrics.rougeL) / 2 * 10);
  },

  meaning_accuracy: (_input, output, golden) => {
    const comparison = compare(output, golden);
    return Math.min(10, (comparison.metrics.cosineSimilarity + comparison.metrics.rougeL) / 2 * 10);
  },

  fluency: (_input, output, _golden) => {
    if (output.trim().length === 0) return 0;
    const avgWPS = avgWordsPerSentence(output);
    // Optimal range: 5-25 words per sentence
    if (avgWPS >= 5 && avgWPS <= 25) return 9;
    if (avgWPS >= 3 && avgWPS <= 35) return 7;
    if (avgWPS >= 1) return 5;
    return 2;
  },

  conciseness: (_input, output, golden) => {
    if (golden.trim().length === 0) return 5;
    const ratio = output.trim().length / golden.trim().length;
    // Score based on proximity to 1.0
    const deviation = Math.abs(1 - ratio);
    if (deviation < 0.1) return 10;
    if (deviation < 0.3) return 8;
    if (deviation < 0.5) return 6;
    if (deviation < 0.8) return 4;
    return 2;
  },

  // Summarize criteria
  key_points_coverage: (_input, output, golden) => {
    const comparison = compare(output, golden);
    return Math.min(10, comparison.metrics.rougeL * 10);
  },

  brevity: (input, output, _golden) => {
    if (input.trim().length === 0) return 5;
    const ratio = output.trim().length / input.trim().length;
    // Good summaries are significantly shorter
    if (ratio < 0.3) return 10;
    if (ratio < 0.5) return 8;
    if (ratio < 0.7) return 6;
    if (ratio < 1.0) return 4;
    return 2;
  },

  accuracy: (_input, output, golden) => {
    const comparison = compare(output, golden);
    return Math.min(10, comparison.overallScore * 10);
  },

  readability: (_input, output, _golden) => {
    if (output.trim().length === 0) return 0;
    const avgWPS = avgWordsPerSentence(output);
    if (avgWPS >= 8 && avgWPS <= 20) return 9;
    if (avgWPS >= 5 && avgWPS <= 30) return 7;
    return 5;
  },

  // Expand criteria
  coherence: (_input, output, golden) => {
    const comparison = compare(output, golden);
    return Math.min(10, (comparison.metrics.cosineSimilarity * 10 + comparison.metrics.rougeL * 10) / 2);
  },

  relevance: (_input, output, golden) => {
    const comparison = compare(output, golden);
    return Math.min(10, comparison.metrics.cosineSimilarity * 10);
  },

  depth: (input, output, _golden) => {
    if (input.trim().length === 0) return 5;
    const ratio = output.trim().length / input.trim().length;
    // Good expansions should be notably longer
    if (ratio > 3) return 9;
    if (ratio > 2) return 8;
    if (ratio > 1.5) return 7;
    if (ratio > 1.0) return 5;
    return 3;
  },

  style_consistency: (_input, output, golden) => {
    const comparison = compare(output, golden);
    return Math.min(10, comparison.metrics.bleuScore * 10 + 3);
  },

  // Critique criteria
  thoroughness: (_input, output, _golden) => {
    // For critique, output may be JSON string
    try {
      const parsed = typeof output === 'string' ? JSON.parse(output) : output;
      if (parsed.observations && Array.isArray(parsed.observations)) {
        const count = parsed.observations.length;
        if (count >= 4) return 9;
        if (count >= 3) return 7;
        if (count >= 2) return 5;
        return 3;
      }
    } catch {
      // Not JSON, count sentences as proxy
      const sentences = countSentences(output);
      if (sentences >= 6) return 8;
      if (sentences >= 4) return 6;
      return 4;
    }
    return 5;
  },

  actionability: (_input, output, _golden) => {
    try {
      const parsed = typeof output === 'string' ? JSON.parse(output) : output;
      if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
        const count = parsed.suggestions.length;
        if (count >= 4) return 9;
        if (count >= 3) return 7;
        if (count >= 2) return 5;
        return 3;
      }
    } catch {
      // Count action-oriented words as proxy
      const actionWords = (output.match(/\b(should|must|recommend|implement|use|add|consider|create)\b/gi) ?? []).length;
      if (actionWords >= 4) return 8;
      if (actionWords >= 2) return 6;
      return 4;
    }
    return 5;
  },

  specificity: (_input, output, golden) => {
    const comparison = compare(output, typeof golden === 'object' ? JSON.stringify(golden) : golden);
    return Math.min(10, comparison.metrics.cosineSimilarity * 10 + 2);
  },

  balance: (_input, output, _golden) => {
    try {
      const parsed = typeof output === 'string' ? JSON.parse(output) : output;
      if (parsed.observations && parsed.suggestions) {
        const obsCount = parsed.observations.length;
        const sugCount = parsed.suggestions.length;
        const ratio = Math.min(obsCount, sugCount) / Math.max(obsCount, sugCount);
        return Math.min(10, ratio * 10);
      }
    } catch {
      // Fall through
    }
    return 5;
  },
};

/**
 * Fallback scorer for unknown criteria — uses overall comparison score.
 */
function fallbackScorer(_input: string, output: string, golden: string): number {
  const goldenStr = typeof golden === 'object' ? JSON.stringify(golden) : golden;
  const comparison = compare(output, goldenStr);
  return Math.min(10, comparison.overallScore * 10);
}

/**
 * Run the local judge on an AI output against golden reference.
 *
 * @param input - Original input text
 * @param output - AI-generated output
 * @param golden - Golden reference output
 * @param operation - Operation type (rewrite, summarize, expand, critique) to look up criteria
 */
export async function localJudge(
  input: string,
  output: string,
  golden: string,
  operation: string,
): Promise<JudgeResult> {
  const criteriaNames = judgePrompts.criteria[operation];
  if (!criteriaNames) {
    throw new Error(`Unknown operation: ${operation}. Available: ${Object.keys(judgePrompts.criteria).join(', ')}`);
  }

  const criteriaScores: Record<string, number> = {};
  const reasoningParts: string[] = [];

  // Get base comparison metrics for reasoning output
  const goldenStr = typeof golden === 'object' ? JSON.stringify(golden) : golden;
  const baseMetrics = compare(output, goldenStr);

  for (const criterion of criteriaNames) {
    const scorer = scorers[criterion] ?? fallbackScorer;
    const raw = scorer(input, output, golden);
    const clamped = Math.min(10, Math.max(0, raw));
    criteriaScores[criterion] = Math.round(clamped * 100) / 100;
    reasoningParts.push(`${criterion}: ${clamped.toFixed(1)}/10`);
  }

  // Overall score = average of per-criterion scores, clamped 0-10
  const scores = Object.values(criteriaScores);
  const overall = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const clampedOverall = Math.min(10, Math.max(0, overall));

  const reasoning =
    `Operation: ${operation} | ` +
    `Base metrics — cosine: ${baseMetrics.metrics.cosineSimilarity.toFixed(3)}, ` +
    `BLEU: ${baseMetrics.metrics.bleuScore.toFixed(3)}, ` +
    `ROUGE-L: ${baseMetrics.metrics.rougeL.toFixed(3)} | ` +
    `Per-criterion: ${reasoningParts.join(', ')}`;

  return {
    score: Math.round(clampedOverall * 100) / 100,
    reasoning,
    criteria: criteriaScores,
  };
}
