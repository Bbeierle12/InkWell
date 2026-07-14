/**
 * Grammar-check plugin state: the content-addressed cache and the anchoring pass.
 *
 * Two rules govern this file, and neither may be weakened:
 *
 *  1. MAP, THEN VERIFY. An issue becomes a decoration only if
 *     `doc.textBetween(from, to) === issue.originalText`. Anything else is
 *     dropped silently. Mis-anchoring is therefore structurally impossible:
 *     the worst a stale result can do is vanish.
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
 *   doc.textBetween(from, to) === originalText
 * Anything that fails that check is dropped silently. A stale scan result can
 * therefore never render over the wrong text — worst case it simply vanishes.
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

        const from = textOffsetToPos(block, pos, issue.offset);
        const to = textOffsetToPos(block, pos, issue.offset + issue.length);
        if (from === null || to === null) continue;

        // Verify. Non-negotiable.
        if (doc.textBetween(from, to) !== issue.originalText) continue;

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
