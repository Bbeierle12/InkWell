import { describe, it, expect } from 'vitest';
import { compare } from './compare';

describe('compare', () => {
  // ── exactMatch tests (2) ──────────────────────────────────────────

  it('exactMatch: identical strings → true', () => {
    const result = compare('hello world', 'hello world');
    expect(result.metrics.exactMatch).toBe(true);
  });

  it('exactMatch: different strings → false', () => {
    const result = compare('hello world', 'goodbye world');
    expect(result.metrics.exactMatch).toBe(false);
  });

  // ── cosineSimilarity tests (3) ────────────────────────────────────

  it('cosineSimilarity: identical → 1.0', () => {
    const result = compare('the quick brown fox', 'the quick brown fox');
    expect(result.metrics.cosineSimilarity).toBeCloseTo(1.0, 5);
  });

  it('cosineSimilarity: similar texts → > 0.7', () => {
    const result = compare('the cat sat', 'the cat sat on the mat');
    expect(result.metrics.cosineSimilarity).toBeGreaterThan(0.7);
  });

  it('cosineSimilarity: completely disjoint → < 0.1', () => {
    const result = compare('alpha beta gamma', 'one two three');
    expect(result.metrics.cosineSimilarity).toBeLessThan(0.1);
  });

  // ── bleuScore tests (3) ───────────────────────────────────────────

  it('bleuScore: identical → 1.0', () => {
    const result = compare(
      'the quick brown fox jumps over the lazy dog',
      'the quick brown fox jumps over the lazy dog',
    );
    expect(result.metrics.bleuScore).toBeCloseTo(1.0, 5);
  });

  it('bleuScore: partial overlap → in (0, 1)', () => {
    const result = compare(
      'the cat sat on the mat',
      'the cat sat on the floor by the door',
    );
    expect(result.metrics.bleuScore).toBeGreaterThan(0);
    expect(result.metrics.bleuScore).toBeLessThan(1);
  });

  it('bleuScore: no shared n-grams → 0', () => {
    const result = compare('alpha beta gamma delta', 'one two three four');
    expect(result.metrics.bleuScore).toBe(0);
  });

  // ── rougeL tests (3) ──────────────────────────────────────────────

  it('rougeL: identical → 1.0', () => {
    const result = compare('the quick brown fox', 'the quick brown fox');
    expect(result.metrics.rougeL).toBeCloseTo(1.0, 5);
  });

  it('rougeL: subsequence measure → in (0, 1)', () => {
    const result = compare(
      'the cat sat on a mat',
      'the cat quickly sat down on a large mat',
    );
    expect(result.metrics.rougeL).toBeGreaterThan(0);
    expect(result.metrics.rougeL).toBeLessThan(1);
  });

  it('rougeL: no common tokens → 0', () => {
    const result = compare('alpha beta gamma', 'one two three');
    expect(result.metrics.rougeL).toBe(0);
  });

  // ── overallScore test (1) ─────────────────────────────────────────

  it('overallScore: perfect match → 1.0, weighted average bounded [0,1]', () => {
    const perfect = compare('hello world foo bar', 'hello world foo bar');
    expect(perfect.overallScore).toBeCloseTo(1.0, 5);
    expect(perfect.overallScore).toBeGreaterThanOrEqual(0);
    expect(perfect.overallScore).toBeLessThanOrEqual(1);

    // Also verify a non-perfect match is bounded
    const partial = compare('the cat sat', 'the dog ran');
    expect(partial.overallScore).toBeGreaterThanOrEqual(0);
    expect(partial.overallScore).toBeLessThanOrEqual(1);
  });
});
