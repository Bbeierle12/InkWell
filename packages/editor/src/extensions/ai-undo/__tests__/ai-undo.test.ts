import { EditorState } from '@tiptap/pm/state';
import { history, undo, redo, undoDepth, redoDepth } from '@tiptap/pm/history';
import { inkwellSchema } from '../../../schema';
import {
  AIUndo,
  AI_OPERATION_META,
  AIOperationSession,
  markAsAIIntermediate,
  markAsAIFinal,
} from '../index';

/**
 * 1.2 AI Undo Atomicity Tests
 *
 * Verifies that multi-step AI edits produce a single undo step
 * and that undo/redo restores exact document state.
 */

/** Create a fresh EditorState with the history plugin and a single empty paragraph. */
function createState(): EditorState {
  return EditorState.create({
    schema: inkwellSchema,
    plugins: [history({ newGroupDelay: 0 })],
  });
}

/**
 * Perform a complete AI operation using the session workflow.
 * Applies `count` intermediate insertions and then commits.
 * Returns the new state.
 */
function performAIOperation(
  state: EditorState,
  count: number,
  prefix = 't',
): EditorState {
  const session = new AIOperationSession(state);

  for (let i = 0; i < count; i++) {
    const tr = state.tr.insertText(`${prefix}${i} `, state.doc.content.size - 1);
    state = session.applyIntermediate(state, tr);
  }

  return session.commit(state);
}

describe('1.2 AI Undo Atomicity', () => {
  // -----------------------------------------------------------------
  // Invariant: ai-ops-single-undo-step
  // -----------------------------------------------------------------
  it('should collapse multi-step AI edits into one undo step', () => {
    let state = createState();
    const undoDepthBefore = undoDepth(state);

    // Simulate an AI operation producing 50 intermediate tokens + commit
    state = performAIOperation(state, 50);

    // Only one undo entry should have been created
    expect(undoDepth(state)).toBe(undoDepthBefore + 1);
  });

  // -----------------------------------------------------------------
  // Invariant: undo-redo-exact-state
  // -----------------------------------------------------------------
  it('should restore exact document state on undo', () => {
    let state = createState();

    // Insert some baseline text so we have a meaningful pre-AI document
    const baselineTr = state.tr.insertText('Hello world', 1);
    state = state.apply(baselineTr);
    const preAIDoc = state.doc;

    // AI operation: 50 intermediate + commit
    state = performAIOperation(state, 50, 'a');

    // Undo the AI operation
    let undone = false;
    undo(state, (tr) => {
      state = state.apply(tr);
      undone = true;
    });
    expect(undone).toBe(true);

    // Document must equal the pre-AI state
    expect(state.doc.eq(preAIDoc)).toBe(true);
  });

  // -----------------------------------------------------------------
  // Redo after undoing AI operation
  // -----------------------------------------------------------------
  it('should allow redo after undoing an AI operation', () => {
    let state = createState();

    // AI operation: 50 intermediate + commit
    state = performAIOperation(state, 50, 'x');
    const postAIDoc = state.doc;

    // Undo
    undo(state, (tr) => {
      state = state.apply(tr);
    });
    expect(state.doc.eq(postAIDoc)).toBe(false);

    // Redo
    redo(state, (tr) => {
      state = state.apply(tr);
    });
    expect(state.doc.eq(postAIDoc)).toBe(true);
  });

  // -----------------------------------------------------------------
  // Non-AI undo history unaffected
  // -----------------------------------------------------------------
  it('should not affect normal (non-AI) undo history', () => {
    // Start with a multi-paragraph document so we can insert at
    // distant positions, which forces ProseMirror history to create
    // separate undo groups (adjacent inserts get merged).
    const doc = inkwellSchema.node('doc', null, [
      inkwellSchema.node('paragraph', null, [inkwellSchema.text('First paragraph content here')]),
      inkwellSchema.node('paragraph', null, [inkwellSchema.text('Second paragraph content here')]),
      inkwellSchema.node('paragraph', null, [inkwellSchema.text('Third paragraph content here')]),
    ]);
    let state = EditorState.create({
      doc,
      schema: inkwellSchema,
      plugins: [history({ newGroupDelay: 0 })],
    });

    // 3 normal user edits at distant positions so each gets its own undo group
    const positions = [1, 35, 70]; // positions in different paragraphs
    for (let i = 0; i < 3; i++) {
      const tr = state.tr.insertText(`user${i}`, positions[i]);
      state = state.apply(tr);
    }
    expect(undoDepth(state)).toBe(3);

    // AI operation: 10 intermediate + commit
    state = performAIOperation(state, 10, 'ai');

    // Should be 3 user edits + 1 AI operation = 4
    expect(undoDepth(state)).toBe(4);

    // Undo AI operation
    undo(state, (tr) => {
      state = state.apply(tr);
    });

    // Should be 3 user edits remaining
    expect(undoDepth(state)).toBe(3);
  });

  // -----------------------------------------------------------------
  // Selective undo: User A → AI B (50 chunks) → User C
  // Ref: Phase 2 Task 2.2
  // Uses a multi-paragraph document with edits at distant positions
  // to ensure ProseMirror's history plugin creates separate undo groups.
  // -----------------------------------------------------------------
  it('should selectively undo user C, then AI B, preserving A', () => {
    // Start with a 3-paragraph document to allow distant edit positions
    const doc = inkwellSchema.node('doc', null, [
      inkwellSchema.node('paragraph', null, [inkwellSchema.text('First paragraph content')]),
      inkwellSchema.node('paragraph', null, [inkwellSchema.text('Second paragraph content')]),
      inkwellSchema.node('paragraph', null, [inkwellSchema.text('Third paragraph content')]),
    ]);
    let state = EditorState.create({
      doc,
      schema: inkwellSchema,
      plugins: [history({ newGroupDelay: 0 })],
    });

    // Edit A: user types at position 1 (beginning of first paragraph)
    const trA = state.tr.insertText('UserA ', 1);
    state = state.apply(trA);
    const afterA = state.doc;
    expect(undoDepth(state)).toBe(1);

    // Edit B: AI applies 50 chunks (appends to end of last paragraph)
    state = performAIOperation(state, 50, 'ai');
    const afterB = state.doc;
    expect(undoDepth(state)).toBe(2); // A + B

    // Edit C: user types at position 1 (beginning of first paragraph)
    // The AIOperationSession.commit() closes the history group, so this
    // edit starts a new undo entry.
    const trC = state.tr.insertText('UserC ', 1);
    state = state.apply(trC);
    expect(undoDepth(state)).toBe(3); // A + B + C

    // Undo once: should reverse only edit C
    undo(state, (tr) => { state = state.apply(tr); });
    expect(state.doc.eq(afterB)).toBe(true);
    expect(undoDepth(state)).toBe(2);

    // Undo again: should reverse entire AI edit B as one unit
    undo(state, (tr) => { state = state.apply(tr); });
    expect(state.doc.eq(afterA)).toBe(true);
    expect(undoDepth(state)).toBe(1);
  });

  // -----------------------------------------------------------------
  // Redo consistency after undoing AI edit
  // Ref: Phase 2 Task 2.2
  // -----------------------------------------------------------------
  it('should redo AI edit atomically after undo', () => {
    let state = createState();

    // User edit
    const tr = state.tr.insertText('prefix', 1);
    state = state.apply(tr);

    // AI operation
    state = performAIOperation(state, 50, 'chunk');
    const postAIDoc = state.doc;

    // Undo the AI edit
    undo(state, (tr) => { state = state.apply(tr); });
    expect(state.doc.eq(postAIDoc)).toBe(false);

    // Redo should restore the entire AI edit atomically
    redo(state, (tr) => { state = state.apply(tr); });
    expect(state.doc.eq(postAIDoc)).toBe(true);
  });

  // -----------------------------------------------------------------
  // markAsAIIntermediate meta verification
  // -----------------------------------------------------------------
  it('should set correct meta on intermediate steps', () => {
    const state = createState();
    const tr = markAsAIIntermediate(state.tr.insertText('test', 1));

    expect(tr.getMeta('addToHistory')).toBe(false);
    expect(tr.getMeta(AI_OPERATION_META)).toBe('intermediate');
  });

  // -----------------------------------------------------------------
  // markAsAIFinal meta verification
  // -----------------------------------------------------------------
  it('should set correct meta on final steps', () => {
    const state = createState();
    const tr = markAsAIFinal(state.tr.insertText('test', 1));

    expect(tr.getMeta('addToHistory')).toBe(true);
    expect(tr.getMeta(AI_OPERATION_META)).toBe('final');
  });

  // -----------------------------------------------------------------
  // Extension registration
  // -----------------------------------------------------------------
  it('should export a valid TipTap extension', () => {
    expect(AIUndo).toBeDefined();
    expect(AIUndo.name).toBe('aiUndo');
  });
});
