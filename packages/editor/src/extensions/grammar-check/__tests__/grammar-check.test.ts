/**
 * Grammar-check plugin tests.
 *
 * The load-bearing guarantee (spec §5.3): an issue is rendered ONLY if
 *   doc.textBetween(from, to) === issue.originalText
 * Everything else is dropped silently. The 500-run property test below is the
 * proof; the rest of this file pins the behaviour that surrounds it.
 *
 * Content-addressing (spec §5.4): the cache is keyed by block TEXT. There is no
 * document version and no retained Mapping. A scan result that lands after the
 * user has typed simply fails to match any block and disappears.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { schema } from 'prosemirror-test-builder';
import { EditorState } from '@tiptap/pm/state';
import { EditorView, DecorationSet } from '@tiptap/pm/view';
import { Node as PMNode } from '@tiptap/pm/model';
import type { GrammarIssue } from '@inkwell/grammar';
import {
  anchorIssues,
  buildDecorations,
  cacheSet,
  MAX_CACHE_ENTRIES,
  type IssueCache,
} from '../state';
import {
  createGrammarCheckPlugin,
  GrammarCheck,
  grammarCheckKey,
  applyScanResult,
  setGrammarEnabled,
} from '../index';

function docOf(...paragraphs: string[]): PMNode {
  return schema.node(
    'doc',
    null,
    paragraphs.map((p) => schema.node('paragraph', null, p ? [schema.text(p)] : [])),
  );
}

const BOTH = { spelling: true, grammar: true };

/** An issue on the word 'sentance' at its offset within `text`. */
function sentanceIssue(text: string): GrammarIssue {
  return {
    id: '123',
    kind: 'spelling',
    ruleKind: 'Spelling',
    offset: text.indexOf('sentance'),
    length: 'sentance'.length,
    originalText: 'sentance',
    message: 'Did you mean "sentence"?',
    suggestions: ['sentence'],
  };
}

function grammarIssueOn(text: string, word: string): GrammarIssue {
  return {
    id: 'g1',
    kind: 'grammar',
    ruleKind: 'Agreement',
    offset: text.indexOf(word),
    length: word.length,
    originalText: word,
    message: 'Agreement',
    suggestions: [],
  };
}

// ---------------------------------------------------------------------------
// anchorIssues — the pure anchoring pass
// ---------------------------------------------------------------------------

describe('anchorIssues', () => {
  it('anchors a cached issue onto the block holding that text', () => {
    const text = 'This sentance is bad.';
    const doc = docOf(text);
    const cache = new Map([[text, [sentanceIssue(text)]]]);

    const anchored = anchorIssues(doc, cache, BOTH);

    expect(anchored).toHaveLength(1);
    expect(doc.textBetween(anchored[0].from, anchored[0].to)).toBe('sentance');
  });

  it('anchors onto BOTH blocks when two paragraphs have identical text', () => {
    const text = 'This sentance is bad.';
    const doc = docOf(text, text);
    const cache = new Map([[text, [sentanceIssue(text)]]]);

    const anchored = anchorIssues(doc, cache, BOTH);

    expect(anchored).toHaveLength(2);
    for (const a of anchored) {
      expect(doc.textBetween(a.from, a.to)).toBe('sentance');
    }
  });

  it('ignores cache entries whose text no longer appears in the doc', () => {
    const stale = 'This sentance is bad.';
    const doc = docOf('Completely different text now.');
    const cache = new Map([[stale, [sentanceIssue(stale)]]]);

    expect(anchorIssues(doc, cache, BOTH)).toEqual([]);
  });

  it('filters by enabled category', () => {
    const text = 'This sentance is bad.';
    const doc = docOf(text);
    const cache = new Map([[text, [sentanceIssue(text)]]]);

    expect(anchorIssues(doc, cache, { spelling: false, grammar: true })).toEqual([]);
    expect(anchorIssues(doc, cache, { spelling: true, grammar: false })).toHaveLength(1);
  });

  it('filters grammar issues independently of spelling issues', () => {
    const text = 'They was sentance.';
    const doc = docOf(text);
    const cache = new Map([[text, [sentanceIssue(text), grammarIssueOn(text, 'was')]]]);

    expect(anchorIssues(doc, cache, BOTH)).toHaveLength(2);

    const spellingOnly = anchorIssues(doc, cache, { spelling: true, grammar: false });
    expect(spellingOnly).toHaveLength(1);
    expect(spellingOnly[0].kind).toBe('spelling');

    const grammarOnly = anchorIssues(doc, cache, { spelling: false, grammar: true });
    expect(grammarOnly).toHaveLength(1);
    expect(grammarOnly[0].kind).toBe('grammar');
  });

  it('anchors inside NESTED textblocks (blockquote, list item), not just top-level ones', () => {
    // doc.forEach() only sees top-level children — a paragraph inside a
    // blockquote is invisible to it, and a blockquote is not a textblock, so a
    // forEach-based walk silently never checks quoted or listed text.
    const text = 'This sentance is bad.';
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('Intro.')]),
      schema.node('blockquote', null, [
        schema.node('paragraph', null, [schema.text(text)]),
      ]),
    ]);
    const cache = new Map([[text, [sentanceIssue(text)]]]);

    const anchored = anchorIssues(doc, cache, BOTH);

    expect(anchored).toHaveLength(1);
    expect(doc.textBetween(anchored[0].from, anchored[0].to)).toBe('sentance');
  });

  it('anchors correctly in a block containing a hard_break', () => {
    // textContent omits the break; document positions count it.
    const para = schema.node('paragraph', null, [
      schema.text('a'),
      schema.node('hard_break'),
      schema.text('sentance'),
    ]);
    const doc = schema.node('doc', null, [para]);
    const text = para.textContent; // 'asentance'
    const cache = new Map([
      [
        text,
        [
          {
            id: 'h',
            kind: 'spelling' as const,
            ruleKind: 'Spelling',
            offset: 1,
            length: 8,
            originalText: 'sentance',
            message: '',
            suggestions: [],
          },
        ],
      ],
    ]);

    const anchored = anchorIssues(doc, cache, BOTH);

    expect(anchored).toHaveLength(1);
    expect(doc.textBetween(anchored[0].from, anchored[0].to)).toBe('sentance');
  });

  it('drops an issue whose originalText no longer matches the doc text at that offset', () => {
    // A hand-crafted poison entry: the cache key matches a live block, but the
    // issue's originalText disagrees with what actually sits at the offset.
    const text = 'This sentance is bad.';
    const doc = docOf(text);
    const poison: GrammarIssue = {
      ...sentanceIssue(text),
      originalText: 'something-else',
    };
    const cache = new Map([[text, [poison]]]);

    expect(anchorIssues(doc, cache, BOTH)).toEqual([]);
  });

  it('drops an issue whose offset+length runs past the end of the block text', () => {
    const text = 'short';
    const doc = docOf(text);
    const overrun: GrammarIssue = {
      id: 'o',
      kind: 'spelling',
      ruleKind: 'Spelling',
      offset: 3,
      length: 99,
      originalText: 'short'.slice(3),
      message: '',
      suggestions: [],
    };
    const cache = new Map([[text, [overrun]]]);

    expect(anchorIssues(doc, cache, BOTH)).toEqual([]);
  });

  it('drops an issue with a negative offset', () => {
    const text = 'This sentance is bad.';
    const doc = docOf(text);
    const bad: GrammarIssue = { ...sentanceIssue(text), offset: -1 };
    const cache = new Map([[text, [bad]]]);

    expect(anchorIssues(doc, cache, BOTH)).toEqual([]);
  });

  it('NEVER mis-anchors: every anchored issue verifies against the live doc', () => {
    // The load-bearing guarantee. Land an arbitrary cached scan result against
    // an arbitrary document and assert the anchor is either correct or absent.
    //
    // Strengthened over the brief in two ways:
    //   1. Documents contain nested blocks and hard_breaks, not just flat
    //      paragraphs of plain text.
    //   2. The scanned text is usually text that REALLY EXISTS in some block
    //      (possibly a since-edited one). Purely random `scannedText` almost
    //      never matches a block, which would make the property vacuous — it
    //      would pass against an implementation that anchors nothing at all.
    //      `anchoredAtLeastOnce` below asserts non-vacuity.
    let anchoredAtLeastOnce = 0;

    /** An inline run: plain text, or a hard_break. */
    const inlineArb = fc.oneof(
      { weight: 4, arbitrary: fc.string({ minLength: 1, maxLength: 12 }) },
      { weight: 1, arbitrary: fc.constant('BR' as const) },
    );

    /** A block: a paragraph, or a blockquote wrapping a paragraph. */
    const blockArb = fc.record({
      quoted: fc.boolean(),
      parts: fc.array(inlineArb, { minLength: 0, maxLength: 4 }),
    });

    function buildDoc(specs: Array<{ quoted: boolean; parts: string[] }>): PMNode {
      const blocks = specs.map((spec) => {
        const content = spec.parts
          .filter((p) => p !== '')
          .map((p) =>
            p === 'BR'
              ? schema.node('hard_break')
              : schema.text(p.replace(/[\n\r]/g, ' ')),
          );
        const para = schema.node('paragraph', null, content);
        return spec.quoted ? schema.node('blockquote', null, [para]) : para;
      });
      return schema.node('doc', null, blocks.length > 0 ? blocks : [schema.node('paragraph')]);
    }

    /** Every textblock's text in the doc, in document order. */
    function blockTexts(doc: PMNode): string[] {
      const out: string[] = [];
      doc.descendants((node) => {
        if (!node.isTextblock) return true;
        out.push(node.textContent);
        return false;
      });
      return out;
    }

    fc.assert(
      fc.property(
        // The document the scan was RUN against.
        fc.array(blockArb, { minLength: 1, maxLength: 4 }),
        // The document the result LANDS against (usually a mutation of the first).
        fc.array(blockArb, { minLength: 1, maxLength: 4 }),
        // Whether the result lands against the same doc it was scanned from.
        fc.boolean(),
        // Which block's text was scanned, and where in it the issue sits.
        fc.nat(),
        fc.nat(),
        fc.nat(),
        // A fully random scanned text, used when we deliberately want a miss.
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.boolean(),
        (
          specsA,
          specsB,
          landOnSameDoc,
          whichBlock,
          rawOffset,
          rawLen,
          randomText,
          useRandomText,
        ) => {
          const scannedDoc = buildDoc(specsA);
          const liveDoc = landOnSameDoc ? scannedDoc : buildDoc(specsB);

          const candidates = blockTexts(scannedDoc).filter((t) => t.length > 0);
          const scannedText =
            useRandomText || candidates.length === 0
              ? randomText
              : candidates[whichBlock % candidates.length];

          const offset = rawOffset % scannedText.length;
          const length = Math.max(1, (rawLen % (scannedText.length - offset)) || 1);
          const issue: GrammarIssue = {
            id: 'x',
            kind: 'spelling',
            ruleKind: 'Spelling',
            offset,
            length,
            originalText: scannedText.slice(offset, offset + length),
            message: '',
            suggestions: [],
          };
          const cache: IssueCache = new Map([[scannedText, [issue]]]);

          const anchored = anchorIssues(liveDoc, cache, BOTH);
          if (anchored.length > 0) anchoredAtLeastOnce++;

          // The guarantee: anything we render sits on text that literally
          // still equals what the engine flagged.
          return anchored.every((a) => liveDoc.textBetween(a.from, a.to) === a.originalText);
        },
      ),
      { numRuns: 500 },
    );

    // Non-vacuity: the property above must actually have anchored things.
    expect(anchoredAtLeastOnce).toBeGreaterThan(50);
  });

  // Spec §9: no-flicker, mirroring the existing ghost-text stability test.
  it('does not flicker: re-anchoring an unchanged doc+cache is byte-identical', () => {
    const text = 'This sentance is bad.';
    const doc = docOf(text, 'A clean second paragraph.', text);
    const cache = new Map([[text, [sentanceIssue(text)]]]);

    const first = anchorIssues(doc, cache, BOTH);
    const second = anchorIssues(doc, cache, BOTH);

    // Identical ids, identical positions, identical order. A squiggle must never
    // appear, vanish, or move on text the user did not touch.
    expect(second).toEqual(first);
  });

  it('does not flicker: toggling a category off and back on restores the exact same anchors', () => {
    const text = 'This sentance is bad.';
    const doc = docOf(text);
    const cache = new Map([[text, [sentanceIssue(text)]]]);

    const before = anchorIssues(doc, cache, BOTH);
    const off = anchorIssues(doc, cache, { spelling: false, grammar: true });
    const back = anchorIssues(doc, cache, BOTH);

    expect(off).toEqual([]);
    expect(back).toEqual(before); // cache hit — no rescan, no flicker
  });
});

// ---------------------------------------------------------------------------
// cacheSet — bounded, content-addressed store
// ---------------------------------------------------------------------------

describe('cacheSet', () => {
  it('returns a NEW map and does not mutate the input', () => {
    const cache: IssueCache = new Map();
    const next = cacheSet(cache, 'a', []);

    expect(next).not.toBe(cache);
    expect(cache.size).toBe(0);
    expect(next.get('a')).toEqual([]);
  });

  it('overwrites an existing key and refreshes its recency', () => {
    let cache: IssueCache = new Map();
    cache = cacheSet(cache, 'a', []);
    cache = cacheSet(cache, 'b', []);
    cache = cacheSet(cache, 'a', [sentanceIssue('sentance')]);

    // 'a' was re-inserted, so it is now the NEWEST entry, not the oldest.
    expect([...cache.keys()]).toEqual(['b', 'a']);
    expect(cache.get('a')).toHaveLength(1);
    expect(cache.size).toBe(2);
  });

  it('evicts the oldest entries once the bound is exceeded', () => {
    let cache: IssueCache = new Map();
    for (let i = 0; i < MAX_CACHE_ENTRIES + 5; i++) {
      cache = cacheSet(cache, `text-${i}`, []);
    }

    expect(cache.size).toBe(MAX_CACHE_ENTRIES);
    expect(cache.has('text-0')).toBe(false);
    expect(cache.has('text-4')).toBe(false);
    expect(cache.has('text-5')).toBe(true);
    expect(cache.has(`text-${MAX_CACHE_ENTRIES + 4}`)).toBe(true);
  });

  it('re-inserting a key keeps it alive across an eviction sweep', () => {
    let cache: IssueCache = new Map();
    cache = cacheSet(cache, 'keepme', []);
    for (let i = 0; i < MAX_CACHE_ENTRIES - 1; i++) {
      cache = cacheSet(cache, `filler-${i}`, []);
    }
    // Refresh 'keepme' — it becomes the newest entry.
    cache = cacheSet(cache, 'keepme', []);
    // One more push would have evicted it if recency were not refreshed.
    cache = cacheSet(cache, 'newest', []);

    expect(cache.size).toBe(MAX_CACHE_ENTRIES);
    expect(cache.has('keepme')).toBe(true);
    expect(cache.has('filler-0')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildDecorations
// ---------------------------------------------------------------------------

describe('buildDecorations', () => {
  it('derives one inline decoration per anchored issue', () => {
    const text = 'This sentance is bad.';
    const doc = docOf(text);
    const issues = anchorIssues(doc, new Map([[text, [sentanceIssue(text)]]]), BOTH);

    const set = buildDecorations(doc, issues);
    const found = set.find();

    expect(found).toHaveLength(1);
    expect(found[0].from).toBe(issues[0].from);
    expect(found[0].to).toBe(issues[0].to);
  });

  it('returns an empty set for no issues', () => {
    const doc = docOf('clean');
    expect(buildDecorations(doc, []).find()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The plugin
// ---------------------------------------------------------------------------

const TEXT = 'This sentance is bad.';

function stateWith(plugin: ReturnType<typeof createGrammarCheckPlugin>, ...paragraphs: string[]) {
  return EditorState.create({ doc: docOf(...paragraphs), plugins: [plugin] });
}

describe('grammar-check plugin state', () => {
  it('starts with no issues and an empty cache', () => {
    const plugin = createGrammarCheckPlugin({
      check: async () => [],
      debounceMs: 10,
      spelling: true,
      grammar: true,
    });
    const state = stateWith(plugin, TEXT);
    const ps = grammarCheckKey.getState(state)!;

    expect(ps.issues).toEqual([]);
    expect(ps.cache.size).toBe(0);
    expect(ps.enabled).toEqual(BOTH);
    expect(ps.decorations).toBeInstanceOf(DecorationSet);
  });

  it('honours the initial enabled options', () => {
    const plugin = createGrammarCheckPlugin({
      check: async () => [],
      debounceMs: 10,
      spelling: false,
      grammar: true,
    });
    expect(grammarCheckKey.getState(stateWith(plugin, TEXT))!.enabled).toEqual({
      spelling: false,
      grammar: true,
    });
  });

  it('applyScanResult caches the issues and anchors them', () => {
    const plugin = createGrammarCheckPlugin({
      check: async () => [],
      debounceMs: 10,
      spelling: true,
      grammar: true,
    });
    let state = stateWith(plugin, TEXT);

    state = state.apply(
      state.tr.setMeta(grammarCheckKey, applyScanResult(TEXT, [sentanceIssue(TEXT)])),
    );

    const ps = grammarCheckKey.getState(state)!;
    expect(ps.cache.get(TEXT)).toHaveLength(1);
    expect(ps.issues).toHaveLength(1);
    expect(state.doc.textBetween(ps.issues[0].from, ps.issues[0].to)).toBe('sentance');
    expect(ps.decorations.find()).toHaveLength(1);
  });

  it('a scan result for text no longer in the doc is cached but anchors nothing', () => {
    // The content-addressing payoff: a result that lands after the user typed
    // does not need a Mapping or a docVersion — it simply matches no block.
    const plugin = createGrammarCheckPlugin({
      check: async () => [],
      debounceMs: 10,
      spelling: true,
      grammar: true,
    });
    let state = stateWith(plugin, 'The user already retyped this.');

    state = state.apply(
      state.tr.setMeta(grammarCheckKey, applyScanResult(TEXT, [sentanceIssue(TEXT)])),
    );

    const ps = grammarCheckKey.getState(state)!;
    expect(ps.cache.has(TEXT)).toBe(true);
    expect(ps.issues).toEqual([]);
    expect(ps.decorations.find()).toEqual([]);
  });

  it('re-anchors on doc change: editing the flagged word drops its decoration', () => {
    const plugin = createGrammarCheckPlugin({
      check: async () => [],
      debounceMs: 10,
      spelling: true,
      grammar: true,
    });
    let state = stateWith(plugin, TEXT);
    state = state.apply(
      state.tr.setMeta(grammarCheckKey, applyScanResult(TEXT, [sentanceIssue(TEXT)])),
    );
    expect(grammarCheckKey.getState(state)!.issues).toHaveLength(1);

    // Fix the typo. The block's text changes, so the cache no longer matches it.
    const from = state.doc.textContent.indexOf('sentance') + 1;
    state = state.apply(state.tr.insertText('e', from + 4, from + 5));

    const ps = grammarCheckKey.getState(state)!;
    expect(state.doc.textContent).toContain('sentence');
    expect(ps.issues).toEqual([]);
  });

  it('re-anchors onto an unedited twin block after the other twin is edited', () => {
    const plugin = createGrammarCheckPlugin({
      check: async () => [],
      debounceMs: 10,
      spelling: true,
      grammar: true,
    });
    let state = stateWith(plugin, TEXT, TEXT);
    state = state.apply(
      state.tr.setMeta(grammarCheckKey, applyScanResult(TEXT, [sentanceIssue(TEXT)])),
    );
    expect(grammarCheckKey.getState(state)!.issues).toHaveLength(2);

    // Type at the very start of the FIRST paragraph.
    state = state.apply(state.tr.insertText('X', 1));

    const ps = grammarCheckKey.getState(state)!;
    expect(ps.issues).toHaveLength(1); // only the untouched twin survives
    expect(state.doc.textBetween(ps.issues[0].from, ps.issues[0].to)).toBe('sentance');
  });

  it('setGrammarEnabled re-anchors without rescanning', () => {
    const plugin = createGrammarCheckPlugin({
      check: async () => [],
      debounceMs: 10,
      spelling: true,
      grammar: true,
    });
    let state = stateWith(plugin, TEXT);
    state = state.apply(
      state.tr.setMeta(grammarCheckKey, applyScanResult(TEXT, [sentanceIssue(TEXT)])),
    );

    state = state.apply(state.tr.setMeta(grammarCheckKey, setGrammarEnabled(false, true)));
    let ps = grammarCheckKey.getState(state)!;
    expect(ps.enabled).toEqual({ spelling: false, grammar: true });
    expect(ps.issues).toEqual([]);
    expect(ps.cache.has(TEXT)).toBe(true); // cache retained — no rescan needed

    state = state.apply(state.tr.setMeta(grammarCheckKey, setGrammarEnabled(true, true)));
    ps = grammarCheckKey.getState(state)!;
    expect(ps.issues).toHaveLength(1);
  });

  it('keeps the previous state object identity for a no-op transaction', () => {
    const plugin = createGrammarCheckPlugin({
      check: async () => [],
      debounceMs: 10,
      spelling: true,
      grammar: true,
    });
    let state = stateWith(plugin, TEXT);
    const before = grammarCheckKey.getState(state)!;

    // A selection-only transaction: no meta, no doc change.
    state = state.apply(state.tr.setMeta('someOtherPlugin', true));

    expect(grammarCheckKey.getState(state)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// The plugin's view: debounce + scan scheduling
// ---------------------------------------------------------------------------

describe('grammar-check plugin view', () => {
  let container: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    container.remove();
  });

  function mount(
    check: (text: string) => Promise<GrammarIssue[]>,
    paragraphs: string[],
    opts: { spelling?: boolean; grammar?: boolean; debounceMs?: number } = {},
  ) {
    const plugin = createGrammarCheckPlugin({
      check,
      debounceMs: opts.debounceMs ?? 500,
      spelling: opts.spelling ?? true,
      grammar: opts.grammar ?? true,
    });
    const view = new EditorView(container, {
      state: EditorState.create({ doc: docOf(...paragraphs), plugins: [plugin] }),
    });
    return view;
  }

  /** Advance past the debounce and let the check() promise chain settle. */
  async function settle(view: EditorView) {
    await vi.advanceTimersByTimeAsync(1000);
    return grammarCheckKey.getState(view.state)!;
  }

  it('scans the initial document after the debounce and renders decorations', async () => {
    const check = vi.fn(async (text: string) => [sentanceIssue(text)]);
    const view = mount(check, [TEXT]);

    expect(check).not.toHaveBeenCalled(); // debounced, not immediate

    const ps = await settle(view);

    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(TEXT);
    expect(ps.issues).toHaveLength(1);
    expect(ps.decorations.find()).toHaveLength(1);
    expect(view.dom.querySelector('.inkwell-grammar-spelling')).not.toBeNull();

    view.destroy();
  });

  it('scans each distinct block once, and never rescans a cached text', async () => {
    const check = vi.fn(async (_text: string): Promise<GrammarIssue[]> => []);
    const view = mount(check, [TEXT, TEXT, 'Another block.']);

    await settle(view);

    // Two DISTINCT texts, even though there are three blocks.
    expect(check).toHaveBeenCalledTimes(2);
    expect(check.mock.calls.map((c) => c[0]).sort()).toEqual(['Another block.', TEXT].sort());

    // A further doc change that reuses already-scanned text triggers no new work.
    check.mockClear();
    view.dispatch(view.state.tr.delete(view.state.doc.content.size - 16, view.state.doc.content.size - 1));
    await settle(view);
    expect(check.mock.calls.every((c) => c[0] !== TEXT)).toBe(true);

    view.destroy();
  });

  it('skips empty and whitespace-only blocks', async () => {
    const check = vi.fn(async (_text: string): Promise<GrammarIssue[]> => []);
    const view = mount(check, ['', '   ', TEXT]);

    await settle(view);

    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(TEXT);

    view.destroy();
  });

  it('debounces: rapid typing produces one scan of the final text', async () => {
    const check = vi.fn(async (_text: string): Promise<GrammarIssue[]> => []);
    const view = mount(check, ['ab'], { debounceMs: 500 });

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(100); // never reaches 500ms
      view.dispatch(view.state.tr.insertText('x', 1));
    }
    expect(check).not.toHaveBeenCalled();

    await settle(view);

    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(view.state.doc.child(0).textContent);

    view.destroy();
  });

  it('does not scan while both categories are disabled, and scans when re-enabled', async () => {
    // Without an enabled-change reschedule this would never scan: turning the
    // feature on is not a doc change, so nothing would ever wake the debounce.
    const check = vi.fn(async (text: string) => [sentanceIssue(text)]);
    const view = mount(check, [TEXT], { spelling: false, grammar: false });

    await settle(view);
    expect(check).not.toHaveBeenCalled();

    view.dispatch(view.state.tr.setMeta(grammarCheckKey, setGrammarEnabled(true, true)));
    const ps = await settle(view);

    expect(check).toHaveBeenCalledTimes(1);
    expect(ps.issues).toHaveLength(1);

    view.destroy();
  });

  it('survives an engine failure: no squigglies, no crash, and it retries later', async () => {
    const check = vi
      .fn<(text: string) => Promise<GrammarIssue[]>>()
      .mockRejectedValueOnce(new Error('wasm exploded'))
      .mockResolvedValue([sentanceIssue(TEXT)]);
    const view = mount(check, [TEXT]);

    let ps = await settle(view);
    expect(check).toHaveBeenCalledTimes(1);
    expect(ps.issues).toEqual([]);
    expect(ps.cache.size).toBe(0); // nothing cached — the text stays scannable

    // A later doc change re-triggers the scan for the same text.
    view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size - 1));
    view.dispatch(view.state.tr.delete(view.state.doc.content.size - 2, view.state.doc.content.size - 1));
    ps = await settle(view);

    expect(check).toHaveBeenCalledTimes(2);
    expect(ps.issues).toHaveLength(1);

    view.destroy();
  });

  it('does not dispatch into a destroyed view when a scan lands late', async () => {
    // A scan can outlive the view. `view.dispatch` on a destroyed EditorView
    // throws; the promise chain's .catch() would swallow it, so the only honest
    // assertion is that the dispatch never happens at all.
    let resolve!: (issues: GrammarIssue[]) => void;
    const check = vi.fn(() => new Promise<GrammarIssue[]>((r) => (resolve = r)));
    const view = mount(check, [TEXT]);
    const dispatch = vi.spyOn(view, 'dispatch');

    await vi.advanceTimersByTimeAsync(600);
    expect(check).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();

    view.destroy();
    resolve([sentanceIssue(TEXT)]);
    await vi.advanceTimersByTimeAsync(10);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('cancels its pending timer on destroy', async () => {
    const check = vi.fn(async (_text: string): Promise<GrammarIssue[]> => []);
    const view = mount(check, [TEXT]);

    view.destroy();
    await vi.advanceTimersByTimeAsync(1000);

    expect(check).not.toHaveBeenCalled();
  });

  it('does not launch a second scan for text already in flight', async () => {
    // A slow engine + a doc change that reverts to the same text must not
    // produce two concurrent scans of the same string.
    let resolve!: (issues: GrammarIssue[]) => void;
    const check = vi.fn(() => new Promise<GrammarIssue[]>((r) => (resolve = r)));
    const view = mount(check, [TEXT], { debounceMs: 100 });

    await vi.advanceTimersByTimeAsync(200);
    expect(check).toHaveBeenCalledTimes(1); // in flight, unresolved

    // Type a char and delete it: the block is back to TEXT, which is in flight.
    view.dispatch(view.state.tr.insertText('z', 1));
    view.dispatch(view.state.tr.delete(1, 2));
    await vi.advanceTimersByTimeAsync(200);

    // 'zThis sentance is bad.' was never scanned (debounce swallowed it) and
    // TEXT was not rescanned because it is still in flight.
    expect(check).toHaveBeenCalledTimes(1);

    resolve([sentanceIssue(TEXT)]);
    const ps = await settle(view);
    expect(ps.issues).toHaveLength(1);

    view.destroy();
  });

  it('scans textblocks nested inside a blockquote', async () => {
    const check = vi.fn(async (text: string) => [sentanceIssue(text)]);
    const plugin = createGrammarCheckPlugin({
      check,
      debounceMs: 100,
      spelling: true,
      grammar: true,
    });
    const doc = schema.node('doc', null, [
      schema.node('blockquote', null, [schema.node('paragraph', null, [schema.text(TEXT)])]),
    ]);
    const view = new EditorView(container, {
      state: EditorState.create({ doc, plugins: [plugin] }),
    });

    const ps = await settle(view);

    expect(check).toHaveBeenCalledWith(TEXT);
    expect(ps.issues).toHaveLength(1);
    expect(view.state.doc.textBetween(ps.issues[0].from, ps.issues[0].to)).toBe('sentance');

    view.destroy();
  });

  it('does not reschedule a scan for a transaction that leaves the doc unchanged', async () => {
    const check = vi.fn(async (_text: string): Promise<GrammarIssue[]> => []);
    const view = mount(check, [TEXT]);
    await settle(view);
    expect(check).toHaveBeenCalledTimes(1);

    check.mockClear();
    view.dispatch(view.state.tr.setMeta('unrelated', true)); // selection-ish no-op
    await settle(view);

    expect(check).not.toHaveBeenCalled();
    view.destroy();
  });
});

// ---------------------------------------------------------------------------
// The TipTap extension wrapper
// ---------------------------------------------------------------------------

describe('GrammarCheck extension', () => {
  it('is a framework-agnostic TipTap extension named grammarCheck', () => {
    expect(GrammarCheck.name).toBe('grammarCheck');
  });

  it('defaults to both categories on with a 500ms debounce and a no-op engine', async () => {
    const defaults = GrammarCheck.options as {
      check: (t: string) => Promise<GrammarIssue[]>;
      debounceMs: number;
      spelling: boolean;
      grammar: boolean;
    };
    expect(defaults.debounceMs).toBe(500);
    expect(defaults.spelling).toBe(true);
    expect(defaults.grammar).toBe(true);
    await expect(defaults.check('anything')).resolves.toEqual([]);
  });

  it('builds a working ProseMirror plugin from its options', () => {
    const configured = GrammarCheck.configure({
      check: async () => [],
      debounceMs: 42,
      spelling: true,
      grammar: false,
    });
    const plugins = configured.config.addProseMirrorPlugins!.call({
      options: configured.options,
    } as never);

    expect(plugins).toHaveLength(1);

    const state = EditorState.create({ doc: docOf(TEXT), plugins });
    expect(grammarCheckKey.getState(state)!.enabled).toEqual({
      spelling: true,
      grammar: false,
    });
  });
});
