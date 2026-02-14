import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Reconciler } from '../index';
import { validateInstructions } from '../schema-validator';
import { remapPosition } from '../position-mapper';
import { schema } from 'prosemirror-test-builder';
import type { AIEditInstruction, ReconcileSuccess, ReconcileFailure } from '@inkwell/shared';

// ---------------------------------------------------------------------------
// Arbitraries (fast-check generators)
// ---------------------------------------------------------------------------

/** Generate a valid instruction type. */
const arbInstructionType = fc.constantFrom('replace', 'insert', 'delete') as fc.Arbitrary<
  'replace' | 'insert' | 'delete'
>;

/** Generate a non-negative integer for positions. */
const arbPos = fc.nat({ max: 1000 });

/** Generate a valid MarkSpec. */
const arbMarkSpec = fc.record({
  type: fc.constantFrom('strong', 'em', 'code', 'link'),
  attrs: fc.constant(undefined),
});

/** Generate an arbitrary AIEditInstruction (may or may not be structurally valid). */
const arbInstruction: fc.Arbitrary<AIEditInstruction> = fc.oneof(
  // replace instruction
  fc.record({
    type: fc.constant('replace' as const),
    range: fc.tuple(arbPos, arbPos).map(([a, b]) => ({
      from: Math.min(a, b),
      to: Math.max(a, b),
    })),
    content: fc.string({ minLength: 1, maxLength: 50 }),
    marks: fc.option(fc.array(arbMarkSpec, { maxLength: 3 }), { nil: undefined }),
  }),
  // insert instruction
  fc.record({
    type: fc.constant('insert' as const),
    range: arbPos.map((p) => ({ from: p, to: p })),
    content: fc.string({ minLength: 1, maxLength: 50 }),
    marks: fc.option(fc.array(arbMarkSpec, { maxLength: 3 }), { nil: undefined }),
  }),
  // delete instruction
  fc.record({
    type: fc.constant('delete' as const),
    range: fc.tuple(arbPos, arbPos).map(([a, b]) => ({
      from: Math.min(a, b),
      to: Math.max(a, b),
    })),
  }),
);

/** Generate an arbitrary object that may or may not be a valid instruction. */
const arbMaybeInstruction = fc.oneof(
  arbInstruction,
  fc.record({
    type: fc.string(),
    range: fc.record({
      from: fc.oneof(fc.integer(), fc.string()) as any,
      to: fc.oneof(fc.integer(), fc.string()) as any,
    }),
    content: fc.option(fc.string(), { nil: undefined }),
  }) as any,
  fc.constant(null) as any,
  fc.constant(42) as any,
  fc.constant('string') as any,
);

/** Generate a PositionChange for remapPosition. */
const arbChange = fc.record({
  from: fc.nat({ max: 500 }),
  to: fc.nat({ max: 500 }),
  insertLength: fc.nat({ max: 200 }),
}).map(({ from, to, insertLength }) => ({
  from: Math.min(from, to),
  to: Math.max(from, to),
  insertLength,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDoc(text: string) {
  return schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text(text)]),
  ]);
}

const reconciler = new Reconciler();

// ===========================================================================
// 2.4 Reconciler -- Property-based (fuzz) Tests
// ===========================================================================

describe('2.4 Reconciler -- Property Tests', () => {
  it('validateInstructions always returns null or string (never throws) for arbitrary input', () => {
    fc.assert(
      fc.property(
        fc.array(arbMaybeInstruction, { maxLength: 10 }),
        (instructions) => {
          // validateInstructions must never throw, regardless of input
          let result: string | null;
          try {
            result = validateInstructions(instructions as any, null);
          } catch (e) {
            // If it throws, the property is violated
            return false;
          }
          // Result must be null (valid) or a non-empty string (error message)
          return result === null || (typeof result === 'string' && result.length > 0);
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it('parse always returns a valid array (never throws) for arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (input) => {
        let result: AIEditInstruction[];
        try {
          result = reconciler.parse(input);
        } catch (e) {
          // parse must never throw
          return false;
        }
        // Result must be an array
        return Array.isArray(result);
      }),
      { numRuns: 10_000 },
    );
  });

  it('parse returns valid-or-empty for arbitrary JSON arrays', () => {
    fc.assert(
      fc.property(
        fc.array(arbMaybeInstruction, { maxLength: 5 }),
        (items) => {
          const json = JSON.stringify(items);
          const result = reconciler.parse(json);

          // Result is always an array
          expect(Array.isArray(result)).toBe(true);

          // If result is non-empty, each item must be a valid instruction
          if (result.length > 0) {
            const error = validateInstructions(result, null);
            expect(error).toBeNull();
          }

          return true;
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it('remapPosition always returns a non-negative number for non-negative inputs', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 1000 }),
        fc.array(arbChange, { maxLength: 10 }),
        (pos, changes) => {
          const result = remapPosition(pos, changes);
          return typeof result === 'number' && result >= 0;
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it('remapPosition is identity when changes array is empty', () => {
    fc.assert(
      fc.property(fc.nat({ max: 10000 }), (pos) => {
        return remapPosition(pos, []) === pos;
      }),
      { numRuns: 10_000 },
    );
  });

  it('when apply succeeds (returns ok: true), the result always passes doc.check()', () => {
    // Generate instructions that target valid positions within a known document
    const docText = 'Hello World Test Document';
    const document = makeDoc(docText);

    // Generate instructions within the document's valid text range (1..docTextLen)
    const arbValidInstruction: fc.Arbitrary<AIEditInstruction> = fc.oneof(
      // replace within text range
      fc.tuple(
        fc.nat({ max: docText.length - 1 }),
        fc.nat({ max: docText.length - 1 }),
      ).chain(([a, b]) => {
        const from = Math.min(a, b) + 1; // +1 because position 0 is before <p>
        const to = Math.max(a, b) + 1;
        return fc.record({
          type: fc.constant('replace' as const),
          range: fc.constant({ from, to }),
          content: fc.string({ minLength: 1, maxLength: 20 }),
        });
      }),
      // insert within text range
      fc.nat({ max: docText.length - 1 }).map((pos) => ({
        type: 'insert' as const,
        range: { from: pos + 1, to: pos + 1 },
        content: 'x',
      })),
      // delete within text range
      fc.tuple(
        fc.nat({ max: docText.length - 1 }),
        fc.nat({ max: docText.length - 1 }),
      ).map(([a, b]) => ({
        type: 'delete' as const,
        range: {
          from: Math.min(a, b) + 1,
          to: Math.max(a, b) + 1,
        },
      })),
    );

    fc.assert(
      fc.property(
        // Use single instructions to avoid complex interaction issues
        arbValidInstruction,
        (instruction) => {
          const result = reconciler.apply([instruction], document);

          if (result.ok) {
            // The result must pass schema validation
            try {
              (result as ReconcileSuccess).doc as any;
              ((result as ReconcileSuccess).doc as any).check();
              return true;
            } catch {
              // If check() throws, that is a violation
              return false;
            }
          }

          // failure result is fine (rejection is valid behavior)
          return true;
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it('apply never modifies the original document (immutability)', () => {
    fc.assert(
      fc.property(
        fc.array(arbInstruction, { minLength: 1, maxLength: 3 }),
        (instructions) => {
          const document = makeDoc('Hello World');
          const originalJson = document.toJSON();

          // Apply may succeed or fail, but original must not change
          reconciler.apply(instructions, document);

          const afterJson = document.toJSON();
          expect(afterJson).toEqual(originalJson);
          return true;
        },
      ),
      { numRuns: 10_000 },
    );
  });

  // --- New property tests for Phase 4 ---

  it('arbitrary (doc, instruction, concurrent changes) triples never cause partial corruption', () => {
    const docText = 'Hello World Test Document For Fuzzing';
    const document = makeDoc(docText);

    const arbValidInstruction: fc.Arbitrary<AIEditInstruction> = fc.oneof(
      fc.tuple(
        fc.nat({ max: docText.length - 1 }),
        fc.nat({ max: docText.length - 1 }),
      ).chain(([a, b]) => {
        const from = Math.min(a, b) + 1;
        const to = Math.max(a, b) + 1;
        return fc.record({
          type: fc.constant('replace' as const),
          range: fc.constant({ from, to }),
          content: fc.string({ minLength: 1, maxLength: 20 }),
        });
      }),
      fc.nat({ max: docText.length - 1 }).map((pos) => ({
        type: 'insert' as const,
        range: { from: pos + 1, to: pos + 1 },
        content: 'x',
      })),
    );

    fc.assert(
      fc.property(
        arbValidInstruction,
        fc.array(arbChange, { maxLength: 5 }),
        (instruction, changes) => {
          const originalJson = document.toJSON();
          const result = reconciler.apply([instruction], document, changes);

          // Original doc must be untouched regardless of outcome
          expect(document.toJSON()).toEqual(originalJson);

          if (result.ok) {
            // Successful result must pass check()
            try {
              ((result as ReconcileSuccess).doc as any).check();
            } catch {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it('remapped positions are never negative (10k iterations)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 5000 }),
        fc.array(arbChange, { maxLength: 20 }),
        (pos, changes) => {
          const result = remapPosition(pos, changes);
          return result >= 0;
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it('rejected edits leave doc JSON-identical to original (10k iterations)', () => {
    fc.assert(
      fc.property(
        fc.array(arbInstruction, { minLength: 1, maxLength: 5 }),
        fc.array(arbChange, { maxLength: 5 }),
        (instructions, changes) => {
          const document = makeDoc('Hello World Test');
          const originalJson = document.toJSON();

          const result = reconciler.apply(instructions, document, changes);

          // Regardless of success or failure, original doc is untouched
          expect(document.toJSON()).toEqual(originalJson);

          // If failed, there should be no partial state leaked
          if (!result.ok) {
            // Verify doc is completely unchanged
            expect(document.toJSON()).toEqual(originalJson);
          }
          return true;
        },
      ),
      { numRuns: 10_000 },
    );
  });
});
