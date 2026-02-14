/**
 * AI Undo Extension
 *
 * Ensures multi-step AI edits collapse into a single undo step.
 *
 * Strategy:
 * 1. Before an AI operation starts, capture the document state.
 * 2. Apply intermediate tokens with `addToHistory: false` so users
 *    see streaming updates but no undo entries accumulate.
 * 3. When the AI operation finishes, commit by:
 *    a. Reverting the doc to the pre-AI snapshot (addToHistory: false).
 *    b. Replacing the doc from pre-AI to post-AI in one transaction
 *       (addToHistory: true), creating exactly one undo step.
 *
 * The extension exports:
 * - Utility functions for marking individual transactions
 * - An `AIOperationSession` class that orchestrates the full workflow
 */
import { Extension } from '@tiptap/core';
import { EditorState, type Transaction } from '@tiptap/pm/state';
import { type Node as PMNode, Fragment, Slice } from '@tiptap/pm/model';

/** Meta key used to tag transactions as AI operations. */
export const AI_OPERATION_META = 'aiOperation';

/**
 * Mark a transaction as an intermediate AI step.
 *
 * Intermediate steps are excluded from the undo history so that the
 * entire AI generation sequence collapses into a single undo entry
 * when the final step is committed.
 */
export function markAsAIIntermediate(tr: Transaction): Transaction {
  return tr.setMeta('addToHistory', false).setMeta(AI_OPERATION_META, 'intermediate');
}

/**
 * Mark a transaction as the final AI step.
 *
 * This step is added to the undo history, creating exactly one undo
 * entry for the full AI operation (all intermediate + this final step).
 */
export function markAsAIFinal(tr: Transaction): Transaction {
  return tr.setMeta('addToHistory', true).setMeta(AI_OPERATION_META, 'final');
}

/**
 * Manages the lifecycle of a single AI operation to ensure all edits
 * collapse into one undo step.
 *
 * Usage:
 * ```ts
 * const session = new AIOperationSession(editorState);
 *
 * // Stream tokens — each intermediate apply returns a new state
 * state = session.applyIntermediate(state, state.tr.insertText('Hello'));
 * state = session.applyIntermediate(state, state.tr.insertText(' World'));
 *
 * // Commit — creates one undo-able step covering all intermediate changes
 * state = session.commit(state);
 * ```
 */
export class AIOperationSession {
  /** Snapshot of the document before the AI operation started. */
  readonly preAIDoc: PMNode;

  constructor(initialState: EditorState) {
    this.preAIDoc = initialState.doc;
  }

  /**
   * Apply an intermediate AI step (not added to undo history).
   * Returns the new editor state.
   */
  applyIntermediate(state: EditorState, tr: Transaction): EditorState {
    return state.apply(markAsAIIntermediate(tr));
  }

  /**
   * Commit the AI operation as a single undo step.
   *
   * This works in two phases:
   * 1. Revert the document to the pre-AI snapshot (not recorded in history).
   * 2. Apply a single transaction from pre-AI to post-AI (recorded in history).
   *
   * The result is exactly one undo entry that, when undone, restores the
   * pre-AI document state.
   */
  commit(state: EditorState): EditorState {
    // Capture the post-AI content before reverting
    const postAIContent = state.doc.content;

    // Phase 1: Revert to pre-AI document (not in history)
    const revertTr = state.tr.replaceWith(0, state.doc.content.size, this.preAIDoc.content);
    markAsAIIntermediate(revertTr);
    state = state.apply(revertTr);

    // Phase 2: Replace from pre-AI to post-AI (one history entry)
    const commitTr = state.tr.replaceWith(0, state.doc.content.size, postAIContent);
    markAsAIFinal(commitTr);
    return state.apply(commitTr);
  }
}

/**
 * TipTap extension for AI undo atomicity.
 *
 * Registered with the editor for identification purposes. The actual
 * transaction marking is performed externally via {@link markAsAIIntermediate},
 * {@link markAsAIFinal}, and {@link AIOperationSession}.
 */
export const AIUndo = Extension.create({
  name: 'aiUndo',
  // No plugins needed — the marking functions are used externally
  // by the DocumentAI runtime to control history behavior.
});
