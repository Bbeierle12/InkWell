import { EditorState } from '@tiptap/pm/state';
import { history, undo, redo, undoDepth } from '@tiptap/pm/history';
import { Node as PMNode, Fragment, Slice } from '@tiptap/pm/model';
import { ReplaceStep } from '@tiptap/pm/transform';
import { inkwellSchema } from '../../schema';

/**
 * 1.2 Transaction Integrity Tests
 *
 * Ensures ProseMirror transactions always leave the document in a valid state.
 * Covers insertions, deletions, replacements, undo/redo, step mapping,
 * failure recovery, large documents, and transaction composition.
 */

/** Create a fresh EditorState with history and a single empty paragraph. */
function createState(): EditorState {
  return EditorState.create({
    schema: inkwellSchema,
    plugins: [history({ newGroupDelay: 0 })],
  });
}

/** Create a state with initial text content in a paragraph. */
function createStateWithText(text: string): EditorState {
  const doc = inkwellSchema.node('doc', null, [
    inkwellSchema.node('paragraph', null, [inkwellSchema.text(text)]),
  ]);
  return EditorState.create({
    doc,
    schema: inkwellSchema,
    plugins: [history({ newGroupDelay: 0 })],
  });
}

/** Assert that a document passes schema validation. */
function assertSchemaValid(doc: PMNode): void {
  // doc.check() throws if the document violates schema constraints
  expect(() => doc.check()).not.toThrow();
}

describe('1.2 Transaction Integrity', () => {
  // -----------------------------------------------------------------
  // Schema-valid after insertText
  // Ref: Invariant: schema-valid-after-operation
  // -----------------------------------------------------------------
  it('should produce schema-valid documents after insertText', () => {
    let state = createState();

    // Insert at the beginning of the paragraph (position 1)
    let tr = state.tr.insertText('Hello', 1);
    state = state.apply(tr);
    assertSchemaValid(state.doc);

    // Insert at the end of existing text
    tr = state.tr.insertText(' World', state.doc.content.size - 1);
    state = state.apply(tr);
    assertSchemaValid(state.doc);

    // Insert in the middle
    tr = state.tr.insertText(' Beautiful', 6); // After "Hello"
    state = state.apply(tr);
    assertSchemaValid(state.doc);

    // Insert at position 1 (beginning)
    tr = state.tr.insertText('>>> ', 1);
    state = state.apply(tr);
    assertSchemaValid(state.doc);
  });

  // -----------------------------------------------------------------
  // Schema-valid after delete
  // -----------------------------------------------------------------
  it('should produce schema-valid documents after delete', () => {
    let state = createStateWithText('Hello Beautiful World');

    // Delete from middle
    let tr = state.tr.delete(6, 16); // Remove " Beautiful"
    state = state.apply(tr);
    assertSchemaValid(state.doc);
    expect(state.doc.textContent).toBe('Hello World');

    // Delete from beginning
    tr = state.tr.delete(1, 6); // Remove "Hello"
    state = state.apply(tr);
    assertSchemaValid(state.doc);
    expect(state.doc.textContent).toBe(' World');

    // Delete remaining text
    tr = state.tr.delete(1, state.doc.content.size - 1);
    state = state.apply(tr);
    assertSchemaValid(state.doc);
    expect(state.doc.textContent).toBe('');
  });

  // -----------------------------------------------------------------
  // Schema-valid after replaceWith
  // -----------------------------------------------------------------
  it('should produce schema-valid documents after replaceWith', () => {
    let state = createStateWithText('Hello World');

    // Replace text content with a new text node
    const newTextNode = inkwellSchema.text('Replaced Content');
    let tr = state.tr.replaceWith(1, state.doc.content.size - 1, newTextNode);
    state = state.apply(tr);
    assertSchemaValid(state.doc);
    expect(state.doc.textContent).toBe('Replaced Content');

    // Replace paragraph content with a different paragraph
    const newParagraph = inkwellSchema.node('paragraph', null, [
      inkwellSchema.text('New Paragraph'),
    ]);
    tr = state.tr.replaceWith(0, state.doc.content.size, newParagraph);
    state = state.apply(tr);
    assertSchemaValid(state.doc);
    expect(state.doc.textContent).toBe('New Paragraph');
  });

  // -----------------------------------------------------------------
  // Idempotent undo/redo (20 random edits)
  // Ref: Invariant: undo-redo-exact-state
  // -----------------------------------------------------------------
  it('should maintain exact state through undo/redo of 20 edits', () => {
    let state = createState();
    const originalDoc = state.doc;

    // Apply 20 edits: mix of insertions and typed text
    for (let i = 0; i < 20; i++) {
      const tr = state.tr.insertText(`edit${i} `, 1);
      state = state.apply(tr);
      assertSchemaValid(state.doc);
    }
    const editedDoc = state.doc;

    // Undo all 20 edits
    for (let i = 0; i < 20; i++) {
      undo(state, (tr) => {
        state = state.apply(tr);
      });
    }
    expect(state.doc.eq(originalDoc)).toBe(true);

    // Redo all 20 edits
    for (let i = 0; i < 20; i++) {
      redo(state, (tr) => {
        state = state.apply(tr);
      });
    }
    expect(state.doc.eq(editedDoc)).toBe(true);
  });

  // -----------------------------------------------------------------
  // Step mapping
  // -----------------------------------------------------------------
  it('should correctly map positions after insertion', () => {
    const state = createStateWithText('abcdef');

    // Insert "XY" at position 3 (after "ab")
    const tr = state.tr.insertText('XY', 3);

    // Positions before the insertion point (1, 2) should be unchanged
    expect(tr.mapping.map(1)).toBe(1);
    expect(tr.mapping.map(2)).toBe(2);

    // Position at insertion point maps forward
    expect(tr.mapping.map(3)).toBe(5); // shifted by length of "XY" (2)

    // Positions after insertion point shift by 2
    expect(tr.mapping.map(4)).toBe(6);
    expect(tr.mapping.map(5)).toBe(7);
    expect(tr.mapping.map(6)).toBe(8);
  });

  // -----------------------------------------------------------------
  // Failed transaction leaves state unchanged
  // -----------------------------------------------------------------
  it('should leave state unchanged when transaction fails', () => {
    const state = createStateWithText('Hello');
    const docBefore = state.doc;

    // Attempt to apply a ReplaceStep with out-of-range positions.
    // ProseMirror's step.apply() returns a StepResult with a failure
    // message, and Transaction.step() throws when the step fails.
    expect(() => {
      const badSlice = new Slice(
        Fragment.from(inkwellSchema.text('bad')),
        0,
        0,
      );
      // Use positions that exceed the document size to trigger a failure
      const badStep = new ReplaceStep(
        state.doc.content.size + 100,
        state.doc.content.size + 200,
        badSlice,
      );
      state.tr.step(badStep);
    }).toThrow();

    // State should be unchanged (EditorState is immutable; the error
    // prevented a new state from being produced)
    expect(state.doc.eq(docBefore)).toBe(true);
  });

  // -----------------------------------------------------------------
  // Large document rapid transactions
  // -----------------------------------------------------------------
  it('should handle rapid transactions on a large document without corruption', () => {
    // Build a document with 100 paragraphs
    const paragraphs: PMNode[] = [];
    for (let i = 0; i < 100; i++) {
      paragraphs.push(
        inkwellSchema.node('paragraph', null, [
          inkwellSchema.text(`Paragraph ${i}: Lorem ipsum dolor sit amet.`),
        ]),
      );
    }
    const doc = inkwellSchema.node('doc', null, paragraphs);
    let state = EditorState.create({
      doc,
      schema: inkwellSchema,
      plugins: [history({ newGroupDelay: 0 })],
    });

    assertSchemaValid(state.doc);

    // Apply 100 rapid insertions at various positions within the document
    for (let i = 0; i < 100; i++) {
      // Insert into a position inside the document (position 1 is safe)
      const tr = state.tr.insertText(`[insert-${i}]`, 1);
      state = state.apply(tr);
    }

    // Validate schema integrity after all rapid insertions
    assertSchemaValid(state.doc);

    // Verify the document is not empty and contains expected content
    expect(state.doc.content.size).toBeGreaterThan(100);
    expect(state.doc.textContent).toContain('[insert-99]');
    expect(state.doc.textContent).toContain('Paragraph 99');
  });

  // -----------------------------------------------------------------
  // Transaction composition
  // -----------------------------------------------------------------
  it('should produce valid states from transactions at different positions', () => {
    // Start with a two-paragraph document
    const doc = inkwellSchema.node('doc', null, [
      inkwellSchema.node('paragraph', null, [inkwellSchema.text('First paragraph')]),
      inkwellSchema.node('paragraph', null, [inkwellSchema.text('Second paragraph')]),
    ]);
    let state = EditorState.create({
      doc,
      schema: inkwellSchema,
      plugins: [history({ newGroupDelay: 0 })],
    });

    assertSchemaValid(state.doc);

    // Transaction 1: Insert text in the first paragraph
    const tr1 = state.tr.insertText('AAA ', 1);
    state = state.apply(tr1);
    assertSchemaValid(state.doc);
    expect(state.doc.textContent).toContain('AAA First paragraph');

    // Transaction 2: Insert text near the end (second paragraph)
    const tr2 = state.tr.insertText(' BBB', state.doc.content.size - 1);
    state = state.apply(tr2);
    assertSchemaValid(state.doc);
    expect(state.doc.textContent).toContain('Second paragraph BBB');

    // Both insertions should be independently present
    expect(state.doc.textContent).toContain('AAA ');
    expect(state.doc.textContent).toContain(' BBB');
  });
});
