import { describe, it, expect, beforeAll } from 'vitest';
import { createLocalEngine } from '../index';
import type { GrammarEngine } from '../index';

describe('GrammarEngine', () => {
  let engine: GrammarEngine;

  beforeAll(async () => {
    engine = createLocalEngine();
    await engine.setup();
  }, 30_000);

  it('flags a misspelling as kind "spelling"', async () => {
    const issues = await engine.check('This sentance has a typo.');
    const spelling = issues.filter((i) => i.kind === 'spelling');
    expect(spelling.length).toBeGreaterThan(0);
    expect(spelling[0].originalText).toBe('sentance');
    expect(spelling[0].suggestions).toContain('sentence');
  });

  it('reports offsets relative to the text passed in', async () => {
    const text = 'This sentance has a typo.';
    const issues = await engine.check(text);
    const issue = issues.find((i) => i.originalText === 'sentance');
    expect(issue).toBeDefined();
    // The anchor contract: slicing the input by the issue's own offset/length
    // must reproduce originalText exactly.
    expect(text.slice(issue!.offset, issue!.offset + issue!.length)).toBe('sentance');
  });

  it('is deterministic — identical input yields identical issues', async () => {
    const text = 'This sentance has a typo.';
    const a = await engine.check(text);
    const b = await engine.check(text);
    expect(b.map((i) => i.id)).toEqual(a.map((i) => i.id));
    expect(b.map((i) => i.offset)).toEqual(a.map((i) => i.offset));
  });

  it('returns no issues for clean text', async () => {
    const issues = await engine.check('This sentence is perfectly fine.');
    expect(issues).toEqual([]);
  });

  it('respects the personal dictionary', async () => {
    const local = createLocalEngine();
    await local.setup();
    const before = await local.check('Bbeierle wrote this.');
    expect(before.some((i) => i.originalText === 'Bbeierle')).toBe(true);

    await local.addWord('Bbeierle');
    const after = await local.check('Bbeierle wrote this.');
    expect(after.some((i) => i.originalText === 'Bbeierle')).toBe(false);
  }, 30_000);

  it('returns plain serializable objects, not WASM handles', async () => {
    const issues = await engine.check('This sentance has a typo.');
    expect(() => structuredClone(issues)).not.toThrow();
  });
});
