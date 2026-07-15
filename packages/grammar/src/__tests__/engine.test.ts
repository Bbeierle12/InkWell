import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createLocalEngine, toAbsoluteWasmUrl } from '../index';
import type { GrammarEngine } from '../index';

describe('toAbsoluteWasmUrl', () => {
  // Regression guard: harper's WorkerLinter runs in a blob-origin worker that
  // cannot fetch a ROOT-RELATIVE wasm URL. createWorkerEngine must anchor it to
  // the page origin. See engine.ts createWorkerEngine.
  it('anchors a root-relative wasm URL to the page origin', () => {
    expect(
      toAbsoluteWasmUrl('/_next/static/media/harper_wasm_bg.abc123.wasm', 'http://localhost:3000/'),
    ).toBe('http://localhost:3000/_next/static/media/harper_wasm_bg.abc123.wasm');
  });

  it('resolves against a deep page path, not just the origin root', () => {
    expect(toAbsoluteWasmUrl('/media/x.wasm', 'http://localhost:3000/docs/note')).toBe(
      'http://localhost:3000/media/x.wasm',
    );
  });

  it('leaves an already-absolute URL unchanged', () => {
    const abs = 'https://cdn.example.com/harper.wasm';
    expect(toAbsoluteWasmUrl(abs, 'http://localhost:3000/')).toBe(abs);
  });

  it('works for a Tauri-style custom-protocol origin', () => {
    expect(toAbsoluteWasmUrl('/media/x.wasm', 'https://tauri.localhost/index.html')).toBe(
      'https://tauri.localhost/media/x.wasm',
    );
  });
});

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

  it('frees WASM handles deterministically instead of relying on GC', async () => {
    // Reach into the private `linter` to grab live Lint/Span/Suggestion
    // instances. wasm-bindgen puts `free()` on each class's shared
    // prototype, so spying on the prototype (not the instance) intercepts
    // every subsequent `.free()` call — including ones made on the
    // internal instances that `engine.check()` allocates itself.
    const linter = (engine as unknown as { linter: { lint: typeof engine.check } }).linter as {
      lint(text: string, opts: { language: string }): Promise<any[]>;
    };
    const [probeLint] = await linter.lint('This sentance has a typo.', { language: 'plaintext' });
    const probeSpan = probeLint.span();
    const [probeSuggestion] = probeLint.suggestions();

    const lintFree = vi.spyOn(Object.getPrototypeOf(probeLint), 'free');
    const spanFree = vi.spyOn(Object.getPrototypeOf(probeSpan), 'free');
    const suggestionFree = vi.spyOn(Object.getPrototypeOf(probeSuggestion), 'free');

    // Release our own probe handles before asserting so they don't count
    // toward the calls made by engine.check() below.
    probeSpan.free();
    probeSuggestion.free();
    probeLint.free();
    lintFree.mockClear();
    spanFree.mockClear();
    suggestionFree.mockClear();

    try {
      const issues = await engine.check('This sentance has a typo.');
      expect(issues.length).toBeGreaterThan(0);

      // Against the unfixed engine (no explicit .free() calls) these would
      // never fire during check() — the handles would sit until GC.
      expect(lintFree).toHaveBeenCalled();
      expect(spanFree).toHaveBeenCalled();
      expect(suggestionFree).toHaveBeenCalled();

      // And the returned issue must still be intact after the handles it
      // was copied from were freed.
      expect(issues.find((i) => i.originalText === 'sentance')?.suggestions).toContain('sentence');
    } finally {
      lintFree.mockRestore();
      spanFree.mockRestore();
      suggestionFree.mockRestore();
    }
  });
});
