/**
 * Grammar-check plugin state: the content-addressed cache and the anchoring pass.
 *
 * Two rules govern this file, and neither may be weakened:
 *
 *  1. MAP, THEN VERIFY. An issue becomes a decoration only if the live document
 *     text under [from, to) still equals `issue.originalText`. Anything else is
 *     dropped silently. Mis-anchoring is therefore structurally impossible:
 *     the worst a stale result can do is vanish. The read-back is LEAF-AWARE
 *     (see LEAF_PLACEHOLDER) — a range that swallows a hard_break is a
 *     mis-anchor, not a match, because a replace over it would eat the break.
 *
 *  2. CONTENT-ADDRESSED, NEVER POSITION-ADDRESSED. The cache is keyed by block
 *     text. There is no document version counter and no retained `Mapping` for
 *     in-flight scans — a result that lands after the user typed simply matches
 *     no block. Two identical paragraphs receiving the same issues is desired
 *     behaviour, not a collision.
 */
import type { Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { GrammarIssue } from '@inkwell/grammar';
import { textOffsetToPos } from './positions';

/**
 * Stand-in for an inline leaf node (hard_break, inline image, ...) when reading
 * a range back out of the document.
 *
 * `doc.textBetween(from, to)` with no `leafText` argument renders a leaf as the
 * EMPTY STRING. That makes the verify below structurally blind: a range that
 * swallows a hard_break reads back as though the break were not there, matches
 * `originalText`, and renders a decoration spanning a line break — which a range
 * replace over [from, to) would then DELETE. Passing U+FFFC (OBJECT REPLACEMENT
 * CHARACTER, the standard placeholder for an embedded object) makes any leaf
 * inside the range visible to the comparison, so it can never silently match.
 *
 * This is NOT safe because "block text never contains U+FFFC" — it can: a user
 * can paste one, and `textContent` carries it through unchanged. The guard's
 * actual safety is LENGTH: a leaf-substituted readback is strictly longer than
 * an honest `originalText` (each swallowed leaf adds one placeholder character
 * that the honest slice never has), so a range that swallows a leaf cannot
 * match an honest `originalText` of the same nominal length. That argument
 * depends on `originalText` actually BEING an honest slice of the scanned
 * text — `anchorIssues` additionally rejects any `originalText` that itself
 * contains this placeholder before anchoring, so a crafted/dishonest
 * `originalText` can never exploit the length gap by containing the sentinel
 * itself. See the `includes(LEAF_PLACEHOLDER)` check below.
 */
const LEAF_PLACEHOLDER = '￼';

/** A GrammarIssue resolved to live ProseMirror document positions. */
export interface AnchoredIssue extends GrammarIssue {
  from: number;
  to: number;
}

export interface EnabledKinds {
  spelling: boolean;
  grammar: boolean;
}

/**
 * Content-addressed cache: block text -> issues found in that exact text.
 * Never keyed by position. See spec §5.4.
 */
export type IssueCache = Map<string, GrammarIssue[]>;

/** Bound the cache so a long editing session cannot grow it without limit. */
export const MAX_CACHE_ENTRIES = 200;

/**
 * Insert (or refresh) a cache entry, returning a NEW map. Eviction is by
 * insertion recency: `delete` before `set` moves an existing key to the end of
 * the Map's iteration order, so re-scanning a text keeps it alive. Only writes
 * refresh recency — a read (an anchoring hit) does not, because `anchorIssues`
 * is pure. In practice a block is only ever written once per distinct text, so
 * the store behaves as a bounded FIFO of recently-scanned texts.
 */
export function cacheSet(cache: IssueCache, text: string, issues: GrammarIssue[]): IssueCache {
  const next: IssueCache = new Map(cache);
  next.delete(text); // re-insert to move to the end (recency)
  next.set(text, issues);
  while (next.size > MAX_CACHE_ENTRIES) {
    // `size > MAX_CACHE_ENTRIES >= 1` guarantees a first key exists, and every
    // iteration removes exactly one entry, so this terminates.
    const oldest = next.keys().next().value as string;
    next.delete(oldest);
  }
  return next;
}

/**
 * The anchoring pass. Pure.
 *
 * Walks EVERY textblock in the document (including paragraphs nested inside
 * blockquotes and list items — `doc.forEach` would only see top-level nodes and
 * would silently never check quoted or listed text), looks each one up in the
 * content-addressed cache, and converts cached character offsets into live
 * document positions.
 *
 * THE GUARANTEE (spec §5.3): every returned issue satisfies
 *   doc.textBetween(from, to, undefined, LEAF_PLACEHOLDER) === originalText
 * Anything that fails that check is dropped silently. A stale scan result can
 * therefore never render over the wrong text — worst case it simply vanishes.
 * Because the read-back is leaf-aware, an issue whose range would straddle an
 * inline leaf (e.g. a word on either side of a hard_break) is dropped too: no
 * decoration may ever cover a line break.
 *
 * Output is in document order, and for a given (doc, cache, enabled) triple it
 * is deterministic and byte-identical across calls — that is what keeps
 * squigglies from flickering.
 */
export function anchorIssues(
  doc: PMNode,
  cache: IssueCache,
  enabled: EnabledKinds,
): AnchoredIssue[] {
  const anchored: AnchoredIssue[] = [];

  // `descendants` yields `pos` = the position immediately BEFORE the node,
  // which is exactly what `textOffsetToPos` wants as `blockPos`.
  doc.descendants((block, pos) => {
    if (!block.isTextblock) return true; // keep descending into container nodes

    const issues = cache.get(block.textContent);
    if (issues) {
      for (const issue of issues) {
        if (issue.kind === 'spelling' && !enabled.spelling) continue;
        if (issue.kind === 'grammar' && !enabled.grammar) continue;

        // `originalText` and `offset`/`length` come from two SEPARATE calls into
        // the grammar engine (`lint.get_problem_text()` vs `span()`); nothing
        // enforces that they agree. The leaf-aware verify below is safe only
        // because an honest `originalText` can never equal a leaf-substituted
        // readback (see LEAF_PLACEHOLDER) — but a `originalText` that itself
        // contains the placeholder sentinel could defeat that length argument
        // by construction, so reject it structurally before anchoring rather
        // than rely on the readback comparison alone.
        if (issue.originalText.includes(LEAF_PLACEHOLDER)) continue;

        const from = textOffsetToPos(block, pos, issue.offset, 'start');
        const to = textOffsetToPos(block, pos, issue.offset + issue.length, 'end');
        if (from === null || to === null) continue;

        // A zero-length (or, if `length` were ever negative, an inverted)
        // issue can map `from` and `to` on either side of an intervening
        // leaf: 'start' skips FORWARD past the leaf while 'end' stops BEFORE
        // it, so the two cross and produce `to <= from`. `doc.textBetween`
        // on an inverted range still returns a well-defined string ('' when
        // to<from) that can spuriously equal a zero-length `originalText`,
        // so the verify below cannot be relied on to catch this — it must be
        // rejected here, before verify, in the same drop-don't-corrupt idiom
        // as the rest of this function. For any length >= 1, from < to
        // strictly, so this can never drop a legitimate issue.
        if (to <= from) continue;

        // Verify. Non-negotiable. LEAF-AWARE: see LEAF_PLACEHOLDER. A range that
        // spans an inline leaf can never silently match, so a break-spanning
        // issue is dropped rather than rendered over a line break.
        if (doc.textBetween(from, to, undefined, LEAF_PLACEHOLDER) !== issue.originalText) {
          continue;
        }

        anchored.push({ ...issue, from, to });
      }
    }

    return false; // a textblock's inline children are not blocks
  });

  return anchored;
}

/** Decorations are DERIVED from issues. issues[] is the single source of truth. */
export function buildDecorations(doc: PMNode, issues: AnchoredIssue[]): DecorationSet {
  return DecorationSet.create(
    doc,
    issues.map((issue) =>
      Decoration.inline(issue.from, issue.to, {
        class: `inkwell-grammar inkwell-grammar-${issue.kind}`,
        'data-grammar-id': issue.id,
      }),
    ),
  );
}
