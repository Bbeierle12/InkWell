import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { AnchoredIssue } from '@inkwell/editor';

/**
 * Stand-in for an inline leaf node (hard_break, inline image, ...) when reading
 * a range back out of the document. MUST match the placeholder Task 3 uses when
 * anchoring (`LEAF_PLACEHOLDER` in grammar-check/state.ts) so the two agree by
 * construction. `doc.textBetween(from, to)` with no `leafText` argument renders
 * a leaf as the EMPTY STRING — structurally blind — so we pass this instead.
 */
const LEAF_PLACEHOLDER = '￼'; // '￼'

/**
 * Build the transaction that applies a fix — or return null and write NOTHING.
 *
 * THE LOAD-BEARING GUARANTEE (spec §5.4a): this is the only part of the grammar
 * feature that writes to the document. A squiggle can go stale between the
 * moment it is rendered and the moment the user clicks it (the scan is async and
 * the user takes a second to decide). So we re-verify the anchor immediately
 * before writing. On ANY mismatch — out of bounds, inverted/zero-length, or the
 * text at [from, to) no longer equal to `originalText` — we return null and the
 * caller writes nothing. A stale squiggle must never corrupt the document.
 *
 * The readback is LEAF-AWARE (see LEAF_PLACEHOLDER). Task 3 already drops any
 * issue whose range would straddle a leaf, so by the time an AnchoredIssue
 * reaches here from/to bracket pure text — but the leaf-aware form is used here
 * too as defense-in-depth, so this check can never be fooled by a leaf even if a
 * future change lets one through.
 *
 * Pure and dependency-light (types only) so the guarantee is directly unit
 * testable in a node environment with no DOM. Do NOT add React/engine imports.
 */
export function applyFix(
  state: EditorState,
  issue: AnchoredIssue,
  replacement: string,
): Transaction | null {
  if (issue.from < 0 || issue.to > state.doc.content.size || issue.from >= issue.to) {
    return null;
  }
  if (state.doc.textBetween(issue.from, issue.to, undefined, LEAF_PLACEHOLDER) !== issue.originalText) {
    return null;
  }
  return state.tr.insertText(replacement, issue.from, issue.to);
}
