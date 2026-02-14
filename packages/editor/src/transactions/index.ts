/**
 * Transaction Utilities
 *
 * Reusable helpers for ProseMirror transactions within Inkwell.
 * These provide safe position clamping, transaction validation, and
 * composition helpers used by the AI reconciler and editor extensions.
 */
import { EditorState, type Transaction } from '@tiptap/pm/state';
import { type Node as PMNode } from '@tiptap/pm/model';

/**
 * Clamp a position to the valid inline range of a document.
 * The minimum valid inline position is 1 (inside the first block),
 * and the maximum is doc.content.size - 1 (end of the last block).
 */
export function clampPosition(pos: number, doc: PMNode): number {
  const max = Math.max(1, doc.content.size - 1);
  return Math.max(1, Math.min(pos, max));
}

/**
 * Insert text at a clamped position, ensuring the position is within
 * the document's valid inline range.
 */
export function safeInsertText(
  state: EditorState,
  text: string,
  pos: number,
): Transaction {
  const clamped = clampPosition(pos, state.doc);
  return state.tr.insertText(text, clamped);
}

/**
 * Delete a range, clamping both endpoints to valid positions.
 * If from >= to after clamping, returns a no-op transaction.
 */
export function safeDelete(
  state: EditorState,
  from: number,
  to: number,
): Transaction {
  const clampedFrom = clampPosition(from, state.doc);
  const clampedTo = clampPosition(to, state.doc);
  if (clampedFrom >= clampedTo) return state.tr;
  return state.tr.delete(clampedFrom, clampedTo);
}

/**
 * Validate that a document is schema-valid. Throws if invalid.
 */
export function assertSchemaValid(doc: PMNode): void {
  doc.check();
}

/**
 * Apply a transaction and validate the resulting document.
 * Returns the new state. Throws if the result is schema-invalid.
 */
export function applyAndValidate(
  state: EditorState,
  tr: Transaction,
): EditorState {
  const newState = state.apply(tr);
  assertSchemaValid(newState.doc);
  return newState;
}

/**
 * Map a position through a transaction's mapping, returning the
 * position in the new document coordinate space.
 */
export function mapPosition(tr: Transaction, pos: number): number {
  return tr.mapping.map(pos);
}
