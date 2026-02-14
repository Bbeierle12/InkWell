import { describe, it, expect } from 'vitest';
import { Reconciler } from '../index';
import { remapPosition, isPositionInDeletedRange } from '../position-mapper';
import { detectOverlaps } from '../overlap-detector';
import { validateInstructions } from '../schema-validator';
import { schema, builders } from 'prosemirror-test-builder';
import type { AIEditInstruction, ReconcileSuccess, ReconcileFailure } from '@inkwell/shared';
import { ReconcileRejectionReason } from '@inkwell/shared';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const b = builders(schema, {
  h1: { nodeType: 'heading', level: 1 },
});

const { doc, p, h1, strong, em } = b as any;

/** Create a simple doc with a single paragraph of text. */
function makeDoc(text: string) {
  return schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text(text)]),
  ]);
}

/** Get all text from a ProseMirror doc. */
function getDocText(node: any): string {
  let text = '';
  node.descendants((child: any) => {
    if (child.isText) {
      text += child.text;
    }
  });
  return text;
}

const reconciler = new Reconciler();

// ===========================================================================
// 2.4 Reconciler Tests
// ===========================================================================

describe('2.4 Reconciler', () => {
  // -------------------------------------------------------------------------
  // Parse tests
  // -------------------------------------------------------------------------
  describe('parse', () => {
    it('should parse valid structured AI output into edit instructions', () => {
      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
        { type: 'insert', range: { from: 5, to: 5 }, content: ' there' },
        { type: 'delete', range: { from: 10, to: 15 } },
      ];

      const result = reconciler.parse(JSON.stringify(instructions));

      expect(result).toHaveLength(3);
      expect(result[0].type).toBe('replace');
      expect(result[0].range.from).toBe(1);
      expect(result[0].range.to).toBe(6);
      expect(result[0].content).toBe('Hi');
      expect(result[1].type).toBe('insert');
      expect(result[1].content).toBe(' there');
      expect(result[2].type).toBe('delete');
      expect(result[2].range).toEqual({ from: 10, to: 15 });
    });

    it('should parse instructions with marks', () => {
      const instructions: AIEditInstruction[] = [
        {
          type: 'replace',
          range: { from: 1, to: 6 },
          content: 'Bold',
          marks: [{ type: 'strong' }],
        },
      ];

      const result = reconciler.parse(JSON.stringify(instructions));
      expect(result).toHaveLength(1);
      expect(result[0].marks).toEqual([{ type: 'strong' }]);
    });

    it('should return empty array for invalid JSON', () => {
      expect(reconciler.parse('not valid json {')).toEqual([]);
      expect(reconciler.parse('')).toEqual([]);
      expect(reconciler.parse('{')).toEqual([]);
      expect(reconciler.parse('{unclosed')).toEqual([]);
    });

    it('should return empty array for valid JSON but wrong structure (not an array)', () => {
      expect(reconciler.parse('"hello"')).toEqual([]);
      expect(reconciler.parse('42')).toEqual([]);
      expect(reconciler.parse('null')).toEqual([]);
      expect(reconciler.parse('true')).toEqual([]);
      expect(reconciler.parse('{"type":"replace"}')).toEqual([]);
    });

    it('should return empty array for array with invalid instruction objects', () => {
      // Missing type
      expect(reconciler.parse('[{"range":{"from":0,"to":1}}]')).toEqual([]);
      // Invalid type
      expect(
        reconciler.parse('[{"type":"unknown","range":{"from":0,"to":1}}]'),
      ).toEqual([]);
      // Missing range
      expect(reconciler.parse('[{"type":"replace","content":"x"}]')).toEqual([]);
      // Missing content for replace
      expect(
        reconciler.parse('[{"type":"replace","range":{"from":0,"to":1}}]'),
      ).toEqual([]);
    });

    it('should return empty array for instructions with negative ranges', () => {
      const bad = [{ type: 'delete', range: { from: -1, to: 5 } }];
      expect(reconciler.parse(JSON.stringify(bad))).toEqual([]);
    });

    it('should return empty array for instructions with from > to', () => {
      const bad = [{ type: 'delete', range: { from: 10, to: 5 } }];
      expect(reconciler.parse(JSON.stringify(bad))).toEqual([]);
    });

    it('should parse an empty array successfully', () => {
      expect(reconciler.parse('[]')).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // validateInstructions tests
  // -------------------------------------------------------------------------
  describe('validateInstructions', () => {
    it('should return null for valid instructions', () => {
      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 0, to: 5 }, content: 'hi' },
        { type: 'insert', range: { from: 3, to: 3 }, content: 'x' },
        { type: 'delete', range: { from: 7, to: 10 } },
      ];
      expect(validateInstructions(instructions, null)).toBeNull();
    });

    it('should reject instructions with invalid type', () => {
      const bad = [{ type: 'merge', range: { from: 0, to: 1 } }] as any;
      expect(validateInstructions(bad, null)).toContain('invalid type');
    });

    it('should reject instructions with missing range', () => {
      const bad = [{ type: 'delete' }] as any;
      expect(validateInstructions(bad, null)).toContain('range');
    });

    it('should reject instructions with non-numeric range values', () => {
      const bad = [
        { type: 'delete', range: { from: 'a', to: 'b' } },
      ] as any;
      expect(validateInstructions(bad, null)).toContain('must be numbers');
    });

    it('should reject instructions with negative range values', () => {
      const bad: AIEditInstruction[] = [
        { type: 'delete', range: { from: -5, to: 3 } },
      ];
      expect(validateInstructions(bad, null)).toContain('non-negative');
    });

    it('should reject instructions with from > to', () => {
      const bad: AIEditInstruction[] = [
        { type: 'delete', range: { from: 10, to: 5 } },
      ];
      expect(validateInstructions(bad, null)).toContain('must be <=');
    });

    it('should reject insert instructions where from !== to', () => {
      const bad: AIEditInstruction[] = [
        { type: 'insert', range: { from: 1, to: 5 }, content: 'x' },
      ];
      expect(validateInstructions(bad, null)).toContain('from === to');
    });

    it('should reject replace/insert instructions without content', () => {
      const noContent: AIEditInstruction[] = [
        { type: 'replace', range: { from: 0, to: 5 } },
      ];
      expect(validateInstructions(noContent, null)).toContain('must have content');

      const noContent2: AIEditInstruction[] = [
        { type: 'insert', range: { from: 3, to: 3 } },
      ];
      expect(validateInstructions(noContent2, null)).toContain('must have content');
    });

    it('should reject instructions with invalid marks structure', () => {
      const badMarks: AIEditInstruction[] = [
        {
          type: 'replace',
          range: { from: 0, to: 5 },
          content: 'x',
          marks: 'not-an-array' as any,
        },
      ];
      expect(validateInstructions(badMarks, null)).toContain('marks must be an array');
    });

    it('should reject instructions with marks missing type', () => {
      const badMarks: AIEditInstruction[] = [
        {
          type: 'replace',
          range: { from: 0, to: 5 },
          content: 'x',
          marks: [{ type: 123 }] as any,
        },
      ];
      expect(validateInstructions(badMarks, null)).toContain('type must be a string');
    });

    it('should reject marks with types not in schema when schema provided', () => {
      const instructions: AIEditInstruction[] = [
        {
          type: 'replace',
          range: { from: 0, to: 5 },
          content: 'x',
          marks: [{ type: 'nonexistent_mark_type' }],
        },
      ];
      expect(validateInstructions(instructions, schema)).toContain('does not exist in schema');
    });

    it('should accept marks with types present in schema', () => {
      const instructions: AIEditInstruction[] = [
        {
          type: 'replace',
          range: { from: 0, to: 5 },
          content: 'x',
          marks: [{ type: 'strong' }],
        },
      ];
      expect(validateInstructions(instructions, schema)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // remapPosition tests
  // -------------------------------------------------------------------------
  describe('remapPosition', () => {
    it('should return the same position when no changes exist', () => {
      expect(remapPosition(5, [])).toBe(5);
    });

    it('should not adjust position before a change', () => {
      // Change at position 10: delete 3 chars, insert 5
      const changes = [{ from: 10, to: 13, insertLength: 5 }];
      // Position 5 is before the change — unaffected
      expect(remapPosition(5, changes)).toBe(5);
    });

    it('should adjust position after an insertion', () => {
      // Insert 5 chars at position 3 (delete 0, insert 5)
      const changes = [{ from: 3, to: 3, insertLength: 5 }];
      // Position 10 should shift by +5
      expect(remapPosition(10, changes)).toBe(15);
    });

    it('should adjust position after a deletion', () => {
      // Delete 5 chars at position 3 (delete from 3 to 8, insert 0)
      const changes = [{ from: 3, to: 8, insertLength: 0 }];
      // Position 10 should shift by -5
      expect(remapPosition(10, changes)).toBe(5);
    });

    it('should adjust position after a replacement', () => {
      // Replace 3 chars with 5 chars at position 2
      const changes = [{ from: 2, to: 5, insertLength: 5 }];
      // Position 10 should shift by +2 (insertLength - deletedLength = 5 - 3)
      expect(remapPosition(10, changes)).toBe(12);
    });

    it('should map position within a deleted range to end of insertion', () => {
      // Delete range [3, 8), insert 2 chars
      const changes = [{ from: 3, to: 8, insertLength: 2 }];
      // Position 5 is within [3, 8] — maps to from + insertLength = 3 + 2 = 5
      expect(remapPosition(5, changes)).toBe(5);
      // Position 8 (at boundary, pos <= to) — maps to 3 + 2 = 5
      expect(remapPosition(8, changes)).toBe(5);
    });

    it('should handle position exactly at change.from (not adjusted)', () => {
      const changes = [{ from: 5, to: 8, insertLength: 2 }];
      // Position exactly at from — pos > from is false, so no adjustment
      expect(remapPosition(5, changes)).toBe(5);
    });

    it('should remap with multiple sequential changes', () => {
      const changes = [
        { from: 2, to: 2, insertLength: 3 }, // Insert 3 chars at pos 2
        { from: 10, to: 15, insertLength: 2 }, // Replace [10,15) with 2 chars
      ];
      // Position 20:
      //   After change 1: pos 20 > 2, delta = 3-0 = +3, pos = 23
      //   After change 2: pos 23 > 10, delta = 2-5 = -3, pos = 20
      expect(remapPosition(20, changes)).toBe(20);
    });

    it('should remap with multiple changes correctly (position between changes)', () => {
      const changes = [
        { from: 2, to: 5, insertLength: 10 }, // Replace 3 chars with 10 at pos 2
        { from: 20, to: 25, insertLength: 1 }, // Replace 5 chars with 1 at pos 20
      ];
      // Position 15:
      //   After change 1: pos 15 > 2, pos > 5, delta = 10-3 = 7, pos = 22
      //   After change 2: pos 22 > 20, pos <= 25, maps to from+insert = 20+1 = 21
      expect(remapPosition(15, changes)).toBe(21);
    });
  });

  // -------------------------------------------------------------------------
  // isPositionInDeletedRange tests
  // -------------------------------------------------------------------------
  describe('isPositionInDeletedRange', () => {
    it('should return false when no changes exist', () => {
      expect(isPositionInDeletedRange(5, [])).toBe(false);
    });

    it('should return true for position inside a pure deletion', () => {
      const changes = [{ from: 3, to: 8, insertLength: 0 }];
      expect(isPositionInDeletedRange(5, changes)).toBe(true);
    });

    it('should return false for position outside a deletion', () => {
      const changes = [{ from: 3, to: 8, insertLength: 0 }];
      expect(isPositionInDeletedRange(10, changes)).toBe(false);
    });

    it('should return false for position at deletion boundary (from)', () => {
      const changes = [{ from: 3, to: 8, insertLength: 0 }];
      expect(isPositionInDeletedRange(3, changes)).toBe(false);
    });

    it('should return true for position at deletion boundary (to)', () => {
      const changes = [{ from: 3, to: 8, insertLength: 0 }];
      expect(isPositionInDeletedRange(8, changes)).toBe(true);
    });

    it('should return false for replacements (insertLength > 0)', () => {
      const changes = [{ from: 3, to: 8, insertLength: 5 }];
      expect(isPositionInDeletedRange(5, changes)).toBe(false);
    });

    it('should return false for pure insertions', () => {
      const changes = [{ from: 5, to: 5, insertLength: 3 }];
      expect(isPositionInDeletedRange(5, changes)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // detectOverlaps tests
  // -------------------------------------------------------------------------
  describe('detectOverlaps', () => {
    it('should return null for non-overlapping instructions', () => {
      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 5 }, content: 'a' },
        { type: 'replace', range: { from: 7, to: 10 }, content: 'b' },
      ];
      expect(detectOverlaps(instructions)).toBeNull();
    });

    it('should detect overlapping replace instructions', () => {
      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 8 }, content: 'a' },
        { type: 'replace', range: { from: 5, to: 10 }, content: 'b' },
      ];
      const result = detectOverlaps(instructions);
      expect(result).not.toBeNull();
      expect(result!.indices).toHaveLength(2);
    });

    it('should allow two inserts at the same position', () => {
      const instructions: AIEditInstruction[] = [
        { type: 'insert', range: { from: 5, to: 5 }, content: 'a' },
        { type: 'insert', range: { from: 5, to: 5 }, content: 'b' },
      ];
      expect(detectOverlaps(instructions)).toBeNull();
    });

    it('should return null for adjacent non-overlapping instructions', () => {
      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 5 }, content: 'a' },
        { type: 'replace', range: { from: 5, to: 10 }, content: 'b' },
      ];
      expect(detectOverlaps(instructions)).toBeNull();
    });

    it('should return null for a single instruction', () => {
      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 5 }, content: 'a' },
      ];
      expect(detectOverlaps(instructions)).toBeNull();
    });

    it('should return null for empty instructions', () => {
      expect(detectOverlaps([])).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // apply tests
  // -------------------------------------------------------------------------
  describe('apply', () => {
    it('should apply a replace instruction', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(true);
      expect(getDocText((result as ReconcileSuccess).doc)).toBe('Hi World');
    });

    it('should apply an insert instruction', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        { type: 'insert', range: { from: 6, to: 6 }, content: 'Beautiful ' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(true);
      expect(getDocText((result as ReconcileSuccess).doc)).toBe('HelloBeautiful  World');
    });

    it('should apply a delete instruction', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        { type: 'delete', range: { from: 6, to: 12 }, },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(true);
      expect(getDocText((result as ReconcileSuccess).doc)).toBe('Hello');
    });

    it('should apply multiple instructions in correct order (end-to-start)', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
        { type: 'replace', range: { from: 7, to: 12 }, content: 'Earth' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(true);
      expect(getDocText((result as ReconcileSuccess).doc)).toBe('Hi Earth');
    });

    it('should apply replace with marks (strong/bold)', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        {
          type: 'replace',
          range: { from: 1, to: 6 },
          content: 'Bold',
          marks: [{ type: 'strong' }],
        },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(true);

      const resultDoc = (result as ReconcileSuccess).doc as any;
      const paragraph = resultDoc.firstChild!;
      const firstChild = paragraph.firstChild!;
      expect(firstChild.text).toBe('Bold');
      expect(firstChild.marks.length).toBe(1);
      expect(firstChild.marks[0].type.name).toBe('strong');
    });

    it('should reject all instructions if one would break schema', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        { type: 'delete', range: { from: 0, to: 100 } },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(false);
      expect((result as ReconcileFailure).reason).toBe(ReconcileRejectionReason.ApplyError);
    });

    it('should not leave partial edits on stream error (Invariant: stream-errors-no-partial-edits)', () => {
      const document = makeDoc('Hello World');
      const originalText = getDocText(document);

      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
        { type: 'replace', range: { from: 500, to: 600 }, content: 'Bad' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(false);
      // Original doc should be completely unchanged
      expect(getDocText(document)).toBe(originalText);
    });

    it('should return success with original doc when no instructions are provided', () => {
      const document = makeDoc('Hello World');
      const result = reconciler.apply([], document);
      expect(result.ok).toBe(true);
      expect((result as ReconcileSuccess).doc).toBe(document);
      expect((result as ReconcileSuccess).applied).toEqual([]);
    });

    it('should return failure for structurally invalid instructions', () => {
      const document = makeDoc('Hello World');
      const bad = [{ type: 'invalid' as any, range: { from: 0, to: 1 } }];
      const result = reconciler.apply(bad, document);
      expect(result.ok).toBe(false);
      expect((result as ReconcileFailure).reason).toBe(ReconcileRejectionReason.ValidationFailed);
    });

    it('should apply instructions with concurrent change remapping', () => {
      const currentDoc = makeDoc('XXHello World');
      const changes = [{ from: 1, to: 1, insertLength: 2 }];

      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
      ];

      const result = reconciler.apply(instructions, currentDoc, changes);
      expect(result.ok).toBe(true);
      expect(getDocText((result as ReconcileSuccess).doc)).toBe('XXHi World');
    });

    it('should reject instructions with unknown mark types via schema validation', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        {
          type: 'replace',
          range: { from: 1, to: 6 },
          content: 'Marked',
          marks: [{ type: 'nonexistent_mark_type' }],
        },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(false);
      expect((result as ReconcileFailure).reason).toBe(ReconcileRejectionReason.InvalidMarkType);
    });

    // --- New tests for Phase 4 enhancements ---

    it('should remap stale position with exact offset', () => {
      // User typed 10 chars at pos 5, edit at pos 20 remaps to pos 30
      const currentDoc = makeDoc('XXXXXXXXXXHello World Data');
      const changes = [{ from: 1, to: 1, insertLength: 10 }];

      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 7, to: 12 }, content: 'Earth' },
      ];

      const result = reconciler.apply(instructions, currentDoc, changes);
      expect(result.ok).toBe(true);
      // from=7 remaps to 17, to=12 remaps to 22
      // In "XXXXXXXXXXHello World Data", positions 17-22 = "World"
      expect(getDocText((result as ReconcileSuccess).doc)).toBe('XXXXXXXXXXHello Earth Data');
    });

    it('should reject when stale position falls in deleted range', () => {
      // User deleted range [5, 15) purely (no insert)
      // AI targets pos 10 which is within [5, 15)
      const currentDoc = makeDoc('Hello World');
      const changes = [{ from: 5, to: 15, insertLength: 0 }];

      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 10, to: 12 }, content: 'New' },
      ];

      const result = reconciler.apply(instructions, currentDoc, changes);
      expect(result.ok).toBe(false);
      expect((result as ReconcileFailure).reason).toBe(ReconcileRejectionReason.StalePositionDeleted);
      expect((result as ReconcileFailure).instructionIndex).toBe(0);
    });

    it('should reject instructions with overlapping ranges', () => {
      const document = makeDoc('Hello Beautiful World');

      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 10 }, content: 'Hi' },
        { type: 'replace', range: { from: 5, to: 15 }, content: 'There' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(false);
      expect((result as ReconcileFailure).reason).toBe(ReconcileRejectionReason.OverlappingRanges);
    });

    it('should succeed with adjacent non-overlapping instructions', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
        { type: 'replace', range: { from: 6, to: 12 }, content: ' Earth' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(true);
      expect(getDocText((result as ReconcileSuccess).doc)).toBe('Hi Earth');
    });

    it('should succeed with two inserts at the same position', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        { type: 'insert', range: { from: 6, to: 6 }, content: 'A' },
        { type: 'insert', range: { from: 6, to: 6 }, content: 'B' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(true);
      // Both inserts at position 6, applied end-to-start (both at 6, order preserved)
      const text = getDocText((result as ReconcileSuccess).doc);
      expect(text).toContain('A');
      expect(text).toContain('B');
    });

    it('should handle concurrent reconciliation: A applies, B applies against A output', () => {
      // Simulate: AI-A changes "Hello" to "Hi", then AI-B changes "World" to "Earth"
      const originalDoc = makeDoc('Hello World');

      // A applies first
      const instructionsA: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
      ];
      const resultA = reconciler.apply(instructionsA, originalDoc);
      expect(resultA.ok).toBe(true);

      // B applies against A's output, with position remapping for A's change
      // A replaced [1,6) with "Hi" (2 chars instead of 5), so delta = -3
      const changesFromA = [{ from: 1, to: 6, insertLength: 2 }];
      const instructionsB: AIEditInstruction[] = [
        { type: 'replace', range: { from: 7, to: 12 }, content: 'Earth' },
      ];

      const docAfterA = (resultA as ReconcileSuccess).doc as any;
      const resultB = reconciler.apply(instructionsB, docAfterA, changesFromA);
      expect(resultB.ok).toBe(true);
      expect(getDocText((resultB as ReconcileSuccess).doc)).toBe('Hi Earth');
    });

    it('should preserve formatting marks on unchanged portions during replace', () => {
      // Create doc with bold text followed by plain text
      const boldMark = schema.marks.strong.create();
      const boldText = schema.text('Bold', [boldMark]);
      const plainText = schema.text(' plain text here');
      const paragraph = schema.node('paragraph', null, [boldText, plainText]);
      const document = schema.node('doc', null, [paragraph]);

      // Replace only the plain text portion (positions after "Bold")
      // "Bold" is at positions 1-5, " plain text here" is at 5-21
      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 5, to: 21 }, content: ' new text' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(true);

      const resultDoc = (result as ReconcileSuccess).doc as any;
      const para = resultDoc.firstChild;
      // First child should still be bold "Bold"
      expect(para.firstChild.text).toBe('Bold');
      expect(para.firstChild.marks.length).toBe(1);
      expect(para.firstChild.marks[0].type.name).toBe('strong');
    });

    it('should be atomic: multi-instruction batch where last fails leaves doc unchanged', () => {
      const document = makeDoc('Hello World');
      const originalJson = document.toJSON();

      // First instruction is valid, second will fail at apply time (out of bounds)
      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
        { type: 'replace', range: { from: 500, to: 600 }, content: 'Bad' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(false);
      expect((result as ReconcileFailure).reason).toBe(ReconcileRejectionReason.ApplyError);
      // Original doc JSON-identical
      expect(document.toJSON()).toEqual(originalJson);
    });

    it('should include applied instructions in success result', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(true);
      expect((result as ReconcileSuccess).applied).toHaveLength(1);
      expect((result as ReconcileSuccess).applied[0].content).toBe('Hi');
    });

    it('should include remapped instructions in applied field when changes provided', () => {
      const currentDoc = makeDoc('XXHello World');
      const changes = [{ from: 1, to: 1, insertLength: 2 }];

      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
      ];

      const result = reconciler.apply(instructions, currentDoc, changes);
      expect(result.ok).toBe(true);
      // Applied should contain remapped positions
      expect((result as ReconcileSuccess).applied[0].range.from).toBe(3);
      expect((result as ReconcileSuccess).applied[0].range.to).toBe(8);
    });

    it('should reject with InvalidMarkType for schema-invalid marks during validation', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        {
          type: 'replace',
          range: { from: 1, to: 6 },
          content: 'Test',
          marks: [{ type: 'nonexistent_mark_type' }],
        },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result.ok).toBe(false);
      // Should be caught during schema-aware validation, not at apply time
      expect((result as ReconcileFailure).reason).toBe(ReconcileRejectionReason.InvalidMarkType);
      expect((result as ReconcileFailure).message).toContain('does not exist in schema');
    });
  });
});
