import { describe, it, expect } from 'vitest';
import { Reconciler } from '../index';
import { remapPosition } from '../position-mapper';
import { validateInstructions } from '../schema-validator';
import { schema, builders } from 'prosemirror-test-builder';
import type { AIEditInstruction } from '@inkwell/shared';

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
  // apply tests
  // -------------------------------------------------------------------------
  describe('apply', () => {
    it('should apply a replace instruction', () => {
      // Doc: <doc><p>Hello World</p></doc>
      // Positions: 0=before p, 1=H, 2=e, 3=l, 4=l, 5=o, 6= , 7=W...
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result).not.toBeNull();
      expect(getDocText(result!)).toBe('Hi World');
    });

    it('should apply an insert instruction', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        { type: 'insert', range: { from: 6, to: 6 }, content: 'Beautiful ' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result).not.toBeNull();
      expect(getDocText(result!)).toBe('HelloBeautiful  World');
    });

    it('should apply a delete instruction', () => {
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        { type: 'delete', range: { from: 6, to: 12 }, },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result).not.toBeNull();
      expect(getDocText(result!)).toBe('Hello');
    });

    it('should apply multiple instructions in correct order (end-to-start)', () => {
      // Doc: <doc><p>Hello World</p></doc>
      // Position mapping: 1=H, 6=space, 7=W, 12=end of text
      const document = makeDoc('Hello World');

      const instructions: AIEditInstruction[] = [
        // Replace 'Hello' (pos 1-6) with 'Hi'
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
        // Replace 'World' (pos 7-12) with 'Earth'
        { type: 'replace', range: { from: 7, to: 12 }, content: 'Earth' },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result).not.toBeNull();
      expect(getDocText(result!)).toBe('Hi Earth');
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
      expect(result).not.toBeNull();

      const paragraph = result!.firstChild!;
      const firstChild = paragraph.firstChild!;
      expect(firstChild.text).toBe('Bold');
      expect(firstChild.marks.length).toBe(1);
      expect(firstChild.marks[0].type.name).toBe('strong');
    });

    it('should reject all instructions if one would break schema (return null)', () => {
      const document = makeDoc('Hello World');

      // Try to replace the entire paragraph content including the paragraph boundary
      // positions, which would produce an invalid document structure
      const instructions: AIEditInstruction[] = [
        // This tries to replace across paragraph boundaries (position 0 is before <p>)
        // which will cause a RangeError in ProseMirror
        { type: 'delete', range: { from: 0, to: 100 } },
      ];

      const result = reconciler.apply(instructions, document);
      expect(result).toBeNull();
    });

    it('should not leave partial edits on stream error (Invariant: stream-errors-no-partial-edits)', () => {
      const document = makeDoc('Hello World');
      const originalText = getDocText(document);

      // Mix of valid and invalid instructions:
      // First is fine, second has an out-of-range position that will throw
      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
        // This position is way out of bounds
        { type: 'replace', range: { from: 500, to: 600 }, content: 'Bad' },
      ];

      const result = reconciler.apply(instructions, document);
      // Result should be null — all rejected
      expect(result).toBeNull();
      // Original doc should be completely unchanged
      expect(getDocText(document)).toBe(originalText);
    });

    it('should return the original document when no instructions are provided', () => {
      const document = makeDoc('Hello World');
      const result = reconciler.apply([], document);
      expect(result).toBe(document);
    });

    it('should return null for structurally invalid instructions', () => {
      const document = makeDoc('Hello World');
      const bad = [{ type: 'invalid' as any, range: { from: 0, to: 1 } }];
      const result = reconciler.apply(bad, document);
      expect(result).toBeNull();
    });

    it('should apply instructions with concurrent change remapping', () => {
      // Original doc when AI made request: "Hello World" (positions 1-12)
      // Since then, "XX" was inserted at the beginning (pos 1, 0 deleted, 2 inserted)
      // Current doc: "XXHello World"
      const currentDoc = makeDoc('XXHello World');
      const changes = [{ from: 1, to: 1, insertLength: 2 }];

      // AI instruction based on OLD positions: replace 'Hello' at pos 1-6
      const instructions: AIEditInstruction[] = [
        { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
      ];

      const result = reconciler.apply(instructions, currentDoc, changes);
      expect(result).not.toBeNull();
      // After remapping: from=1 maps to 3 (1+2), to=6 maps to 8 (6+2)
      // So we replace "Hello" in "XXHello World" -> "XXHi World"
      expect(getDocText(result!)).toBe('XXHi World');
    });

    it('should reject instructions with unknown mark types', () => {
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
      expect(result).toBeNull();
    });
  });
});
