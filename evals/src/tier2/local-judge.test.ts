import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { localJudge } from './local-judge';

// Load golden data
const rewriteGolden: { pairs: { input: string; output: string; style: string }[] } = JSON.parse(
  readFileSync(resolve(__dirname, '../golden/rewrite/golden.json'), 'utf-8'),
);
const summarizeGolden: { pairs: { input: string; output: string }[] } = JSON.parse(
  readFileSync(resolve(__dirname, '../golden/summarize/golden.json'), 'utf-8'),
);
const expandGolden: { pairs: { input: string; output: string }[] } = JSON.parse(
  readFileSync(resolve(__dirname, '../golden/expand/golden.json'), 'utf-8'),
);
const critiqueGolden: {
  pairs: { input: string; output: { observations: string[]; suggestions: string[] } }[];
} = JSON.parse(readFileSync(resolve(__dirname, '../golden/critique/golden.json'), 'utf-8'));

describe('Tier 2 — Local Judge (Deterministic Heuristics)', () => {
  it('should score rewrite golden pairs >= 6/10', async () => {
    for (const pair of rewriteGolden.pairs) {
      const result = await localJudge(pair.input, pair.output, pair.output, 'rewrite');
      expect(result.score).toBeGreaterThanOrEqual(6);
      // Should return all 4 criteria
      expect(Object.keys(result.criteria)).toHaveLength(4);
    }
  });

  it('should score summarize golden pairs >= 6/10', async () => {
    for (const pair of summarizeGolden.pairs) {
      const result = await localJudge(pair.input, pair.output, pair.output, 'summarize');
      expect(result.score).toBeGreaterThanOrEqual(6);
    }
  });

  it('should score expand golden pairs >= 6/10', async () => {
    for (const pair of expandGolden.pairs) {
      const result = await localJudge(pair.input, pair.output, pair.output, 'expand');
      expect(result.score).toBeGreaterThanOrEqual(6);
    }
  });

  it('should score critique golden pairs >= 6/10', async () => {
    for (const pair of critiqueGolden.pairs) {
      const golden = JSON.stringify(pair.output);
      const result = await localJudge(pair.input, golden, golden, 'critique');
      expect(result.score).toBeGreaterThanOrEqual(6);
    }
  });

  it('should score completely wrong output < 5/10', async () => {
    const result = await localJudge(
      'The meeting was productive and covered key topics.',
      'Purple elephants dance on Mars every Tuesday with quantum spaghetti.',
      'The meeting proved productive, covering several key strategic topics.',
      'rewrite',
    );
    expect(result.score).toBeLessThan(5);
  });

  it('should keep all criteria scores in 0-10 range', async () => {
    for (const pair of rewriteGolden.pairs) {
      const result = await localJudge(pair.input, pair.output, pair.output, 'rewrite');
      for (const [, score] of Object.entries(result.criteria)) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(10);
      }
    }
  });

  it('should include metric values in reasoning string', async () => {
    const pair = rewriteGolden.pairs[0];
    const result = await localJudge(pair.input, pair.output, pair.output, 'rewrite');
    expect(result.reasoning).toContain('cosine:');
    expect(result.reasoning).toContain('BLEU:');
    expect(result.reasoning).toContain('ROUGE-L:');
    expect(result.reasoning).toContain('Operation: rewrite');
  });

  it('should score empty output < 3/10', async () => {
    const result = await localJudge(
      'The meeting was productive.',
      '',
      'The meeting proved productive, covering key topics.',
      'rewrite',
    );
    expect(result.score).toBeLessThan(3);
  });
});
