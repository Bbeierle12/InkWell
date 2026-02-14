import { EditorState } from '@tiptap/pm/state';
import { history, undo, redo, undoDepth } from '@tiptap/pm/history';
import { Node as PMNode } from '@tiptap/pm/model';
import * as fc from 'fast-check';
import { inkwellSchema } from '../../schema';

/**
 * 1.2 Transaction Integrity — Property-based (fuzz) tests
 *
 * Uses fast-check to verify that schema invariants hold under
 * arbitrary transaction sequences.
 */

/** Create a base state with a paragraph containing seed text. */
function createBaseState(text = 'The quick brown fox jumps over the lazy dog.'): EditorState {
  const doc = inkwellSchema.node('doc', null, [
    inkwellSchema.node('paragraph', null, [inkwellSchema.text(text)]),
  ]);
  return EditorState.create({
    doc,
    schema: inkwellSchema,
    plugins: [history({ newGroupDelay: 0 })],
  });
}

/** Clamp a position to the valid inline range for the first paragraph. */
function clampPos(pos: number, doc: PMNode): number {
  // Valid text positions inside the first paragraph are [1, contentEnd-1]
  // where contentEnd is doc.content.size (the end-of-doc boundary).
  const max = Math.max(1, doc.content.size - 1);
  return Math.max(1, Math.min(pos, max));
}

describe('1.2 Transaction Integrity — Property Tests', () => {
  // -----------------------------------------------------------------
  // Schema validity for arbitrary insertions
  // Ref: Invariant: schema-valid-after-operation
  // -----------------------------------------------------------------
  it('should maintain schema validity for arbitrary insertions', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 0, max: 1000 }),
        (text, rawPos) => {
          const state = createBaseState();
          const pos = clampPos(rawPos, state.doc);
          const tr = state.tr.insertText(text, pos);
          const newState = state.apply(tr);
          // Schema validation: throws if invalid
          newState.doc.check();
        },
      ),
      { numRuns: 10_000 },
    );
  });

  // -----------------------------------------------------------------
  // Serialize-deserialize stability through edits
  // Ref: Invariant: serialize-deserialize-stable
  // -----------------------------------------------------------------
  it('should maintain serialize-deserialize stability through arbitrary edits', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            text: fc.string({ minLength: 1, maxLength: 20 }),
            rawPos: fc.integer({ min: 0, max: 1000 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        (edits) => {
          let state = createBaseState();

          // Apply a sequence of edits
          for (const edit of edits) {
            const pos = clampPos(edit.rawPos, state.doc);
            const tr = state.tr.insertText(edit.text, pos);
            state = state.apply(tr);
          }

          // Serialize to JSON and deserialize back
          const json = state.doc.toJSON();
          const restored = PMNode.fromJSON(inkwellSchema, json);

          // Documents must be structurally equal
          if (!state.doc.eq(restored)) {
            throw new Error('Serialize-deserialize round-trip produced different document');
          }

          // Restored document must also pass schema validation
          restored.check();
        },
      ),
      { numRuns: 10_000 },
    );
  });

  // -----------------------------------------------------------------
  // Undo-redo exact state
  // Ref: Invariant: undo-redo-exact-state
  // -----------------------------------------------------------------
  it('should preserve exact state through undo-redo of arbitrary edit sequences', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            text: fc.string({ minLength: 1, maxLength: 10 }),
            rawPos: fc.integer({ min: 0, max: 1000 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (edits) => {
          let state = createBaseState();
          const originalDoc = state.doc;

          // Apply edits
          for (const edit of edits) {
            const pos = clampPos(edit.rawPos, state.doc);
            const tr = state.tr.insertText(edit.text, pos);
            state = state.apply(tr);
          }
          const editedDoc = state.doc;

          // Undo all edits
          const depth = undoDepth(state);
          for (let i = 0; i < depth; i++) {
            const undone = undo(state, (tr) => {
              state = state.apply(tr);
            });
            if (!undone) break;
          }

          // After full undo, document must match original
          if (!state.doc.eq(originalDoc)) {
            throw new Error('Full undo did not restore original document');
          }

          // Redo all edits
          let redoCount = 0;
          while (redo(state, (tr) => { state = state.apply(tr); })) {
            redoCount++;
          }

          // After full redo, document must match edited state
          if (!state.doc.eq(editedDoc)) {
            throw new Error('Full redo did not restore edited document');
          }
        },
      ),
      { numRuns: 10_000 },
    );
  });
});
