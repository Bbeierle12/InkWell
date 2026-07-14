import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * Convert a character offset within `block.textContent` into an absolute
 * ProseMirror document position.
 *
 * This is NOT `blockPos + 1 + offset`. A block may contain inline non-text
 * nodes (hard breaks, inline images) which `textContent` omits but which
 * ProseMirror positions count. Naive addition drifts silently past them.
 *
 * The walk tracks two cursors in lockstep as it visits the block's inline
 * children:
 *   - `textCursor`: chars consumed so far in `block.textContent`.
 *   - `posCursor`: positions consumed so far in the document, relative to
 *     the start of the block's content (`blockPos + 1`).
 *
 * Boundary care: when `offset` falls exactly at the end of a text node, the
 * function does NOT resolve immediately. Resolving eagerly (e.g. via a `<=`
 * comparison) would return "the position right after this text node," which
 * is only correct if the *next* sibling is more text or block-end. If the
 * next sibling is a non-text node (e.g. hard_break), that eager answer lands
 * *inside* the non-text node's position span instead of at the start of the
 * text that follows it. Deferring the decision to the next loop iteration
 * (via a strict `<` comparison) lets a following non-text node's position
 * span be walked past first, so the boundary offset resolves to the correct
 * side.
 *
 * @param block     The top-level block node (e.g. a paragraph).
 * @param blockPos  The document position of `block` itself (i.e. the position
 *                  immediately BEFORE it). Its content starts at blockPos + 1.
 * @param offset    Character offset into `block.textContent`.
 * @param direction Which end of a [from, to) range this call is resolving.
 *                  Matters ONLY when `offset` lands exactly at a text node's
 *                  end and is followed by a non-text sibling that contributes
 *                  no characters (e.g. a hard_break) before more text: a
 *                  'start' position should skip forward past it to land on
 *                  the next real character (so `from` never sits awkwardly
 *                  before a leaf it isn't including), while an 'end' position
 *                  must stop immediately, right after the last character
 *                  actually included — walking forward would silently widen
 *                  the range to swallow that leaf, exactly the shape of a
 *                  corrupting replace. Defaults to 'start' for source
 *                  compatibility with callers computing only a single point.
 * @returns The absolute document position, or `null` if `offset` is out of
 *          range or lands inside a non-text inline node's interior (there is
 *          no single ProseMirror position that addresses "partway through" a
 *          leaf/atom node's text representation).
 *
 * Invariant (property-tested): for any addressable [offset, offset+len),
 * calling with direction 'start' for `offset` and 'end' for `offset + len`
 * yields a range [from, to) such that reading it back leaf-aware never
 * starts or ends on a leaf, and with leaves stripped equals
 *   block.textContent.slice(offset, offset + len)
 */
export function textOffsetToPos(
  block: PMNode,
  blockPos: number,
  offset: number,
  direction: 'start' | 'end' = 'start',
): number | null {
  if (offset < 0) return null;

  const contentStart = blockPos + 1;
  let textCursor = 0; // chars consumed in block.textContent
  let posCursor = 0; // positions consumed in block content
  // Position just after the last child that CONTRIBUTED CHARACTERS. Trailing
  // children that contribute nothing (a hard_break at the end of a paragraph)
  // advance `posCursor` but must not advance this. See the fallback below.
  let posAfterText = 0;

  for (let i = 0; i < block.childCount; i++) {
    // An 'end' position that has already accounted for every character up to
    // `offset` must resolve HERE, before any following non-text sibling (that
    // contributes no characters) is walked. Otherwise the loop would defer
    // past it exactly the way a 'start' position correctly does, and the
    // resulting range would swallow a leaf between the last included
    // character and the next one — an interior sibling of the bug already
    // fixed for the end-of-block case below, just mid-document instead of at
    // the block's very end.
    if (direction === 'end' && offset === textCursor) {
      return contentStart + posCursor;
    }

    const child = block.child(i);

    if (child.isText) {
      // A text node (isText === true) always has a defined `.text` string by
      // ProseMirror's own invariant; the non-null assertion documents that
      // rather than adding an untestable defensive fallback.
      const len = child.text!.length;
      // Strict `<`: an offset exactly at this node's end is NOT resolved
      // here. It is deferred so a following non-text sibling's position
      // span gets walked past before we decide where the offset lands.
      if (offset < textCursor + len) {
        return contentStart + posCursor + (offset - textCursor);
      }
      textCursor += len;
      posCursor += len;
      posAfterText = posCursor;
    } else {
      // Non-text inline node (hard_break, inline atom, ...): it occupies
      // `child.nodeSize` document positions but usually contributes nothing
      // to textContent. If it *does* contribute characters (e.g. some atom
      // with a text-ish spec), an offset landing inside that span cannot be
      // mapped to a single position within the node's interior — treat it
      // as unaddressable rather than guess.
      const childTextLen = child.textContent.length;
      if (childTextLen > 0 && offset < textCursor + childTextLen) {
        return null;
      }
      textCursor += childTextLen;
      posCursor += child.nodeSize;
      // Only a child that actually contributed characters moves the end-of-text
      // mark forward.
      if (childTextLen > 0) posAfterText = posCursor;
    }
  }

  // Offset exactly at the end of the block's text.
  //
  // `posCursor` is NOT the answer here. The strict-`<` deferral above walks the
  // loop to completion for an end-of-text offset, so by now `posCursor` has been
  // advanced past every TRAILING non-text child. For `<p>ab<br></p>` that would
  // map offset 2 to the position AFTER the hard_break, and an issue on the last
  // character would produce a range covering 'b' AND the break — which a range
  // replace would then delete. `posAfterText` is the position immediately after
  // the last character-contributing child, which is what "the end of the text"
  // means. For a block that ends in text the two are identical, so the interior
  // -break case (`<p>a<br>b</p>`, where offset 1 must resolve AFTER the break)
  // is unaffected.
  if (offset === textCursor) return contentStart + posAfterText;

  return null;
}
