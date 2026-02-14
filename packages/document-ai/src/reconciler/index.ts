/**
 * Reconciler
 *
 * Converts AI output into ProseMirror document mutations, with position
 * remapping and schema validation.
 *
 * Invariants:
 * - reconciler-valid-or-reject: Parse always returns valid instructions or empty array
 * - stream-errors-no-partial-edits: Apply is atomic; on failure, no edits are applied
 */
import type {
  AIEditInstruction,
  MarkSpec,
  ReconcileResult,
  ReconcileSuccess,
  ReconcileFailure,
} from '@inkwell/shared';
import { ReconcileRejectionReason } from '@inkwell/shared';
import { validateInstructions } from './schema-validator';
import { remapPosition, isPositionInDeletedRange } from './position-mapper';
import type { PositionChange } from './position-mapper';
import { detectOverlaps } from './overlap-detector';
import { Node as PMNode, Fragment, Slice, Mark, Schema } from 'prosemirror-model';

export { remapPosition, isPositionInDeletedRange } from './position-mapper';
export { validateInstructions } from './schema-validator';
export { detectOverlaps } from './overlap-detector';
export type { PositionChange } from './position-mapper';
export type { OverlapResult } from './overlap-detector';

export class Reconciler {
  /**
   * Parse AI output and produce edit instructions.
   *
   * Expects a JSON string containing an array of AIEditInstruction objects.
   * Returns [] if the JSON is invalid or doesn't match expected schema.
   *
   * Ref: Invariant reconciler-valid-or-reject
   */
  parse(aiOutput: string): AIEditInstruction[] {
    let parsed: unknown;

    try {
      parsed = JSON.parse(aiOutput);
    } catch {
      // Invalid JSON — reject
      return [];
    }

    // Must be an array
    if (!Array.isArray(parsed)) {
      return [];
    }

    // Validate the structure of each instruction
    const instructions = parsed as AIEditInstruction[];
    const error = validateInstructions(instructions, null);
    if (error !== null) {
      return [];
    }

    return instructions;
  }

  /**
   * Apply edit instructions to a ProseMirror document.
   *
   * Instructions are sorted by position and applied from end to start
   * to avoid position shifting issues. If any instruction would produce
   * an invalid document, ALL instructions are rejected.
   *
   * @param instructions - Array of validated AIEditInstructions
   * @param doc - ProseMirror Node (the document root)
   * @param changes - Optional array of concurrent changes for position remapping
   * @returns ReconcileResult — discriminated union with ok: true/false
   *
   * Ref: Invariant stream-errors-no-partial-edits
   */
  apply(
    instructions: AIEditInstruction[],
    doc: PMNode,
    changes?: PositionChange[],
  ): ReconcileResult {
    if (instructions.length === 0) {
      return { ok: true, doc, applied: [] } as ReconcileSuccess;
    }

    // Structural validation
    const validationError = validateInstructions(instructions, null);
    if (validationError !== null) {
      return {
        ok: false,
        reason: ReconcileRejectionReason.ValidationFailed,
        message: validationError,
      } as ReconcileFailure;
    }

    // Schema-aware mark validation (check mark types exist in schema)
    const pmSchema = doc.type.schema;
    const schemaValidationError = validateInstructions(instructions, pmSchema);
    if (schemaValidationError !== null) {
      // Determine if it's an invalid mark type issue
      const reason = schemaValidationError.includes('does not exist in schema')
        ? ReconcileRejectionReason.InvalidMarkType
        : ReconcileRejectionReason.ValidationFailed;
      return {
        ok: false,
        reason,
        message: schemaValidationError,
      } as ReconcileFailure;
    }

    // Stale-position-in-deleted-range check before remapping
    if (changes && changes.length > 0) {
      for (let i = 0; i < instructions.length; i++) {
        const inst = instructions[i];
        if (
          isPositionInDeletedRange(inst.range.from, changes) ||
          isPositionInDeletedRange(inst.range.to, changes)
        ) {
          return {
            ok: false,
            reason: ReconcileRejectionReason.StalePositionDeleted,
            message: `Instruction [${i}]: position falls within a deleted range`,
            instructionIndex: i,
          } as ReconcileFailure;
        }
      }
    }

    // Remap positions if concurrent changes were provided
    let remapped = instructions;
    if (changes && changes.length > 0) {
      remapped = instructions.map((inst) => ({
        ...inst,
        range: {
          from: remapPosition(inst.range.from, changes),
          to: remapPosition(inst.range.to, changes),
        },
      }));
    }

    // Overlap detection on remapped instructions
    const overlap = detectOverlaps(remapped);
    if (overlap !== null) {
      return {
        ok: false,
        reason: ReconcileRejectionReason.OverlappingRanges,
        message: `Instructions [${overlap.indices[0]}] and [${overlap.indices[1]}] have overlapping ranges`,
      } as ReconcileFailure;
    }

    // Sort instructions by `from` position descending (process end-to-start)
    // This ensures earlier edits don't shift positions of later ones
    const sorted = [...remapped].sort((a, b) => b.range.from - a.range.from);

    let result = doc;

    try {
      for (const inst of sorted) {
        result = this._applyOne(inst, result, pmSchema);
      }

      // Validate the final document against the schema
      result.check();
      return { ok: true, doc: result, applied: remapped } as ReconcileSuccess;
    } catch (err) {
      // Any error means we reject all instructions
      return {
        ok: false,
        reason: ReconcileRejectionReason.ApplyError,
        message: err instanceof Error ? err.message : 'Unknown apply error',
      } as ReconcileFailure;
    }
  }

  /**
   * Apply a single instruction to a document.
   */
  private _applyOne(
    inst: AIEditInstruction,
    doc: PMNode,
    schema: Schema,
  ): PMNode {
    const { from, to } = inst.range;

    switch (inst.type) {
      case 'delete': {
        return doc.replace(from, to, Slice.empty);
      }

      case 'insert': {
        const textNode = this._createTextNode(inst.content!, inst.marks, schema);
        const slice = new Slice(Fragment.from(textNode), 0, 0);
        return doc.replace(from, to, slice);
      }

      case 'replace': {
        const textNode = this._createTextNode(inst.content!, inst.marks, schema);
        const slice = new Slice(Fragment.from(textNode), 0, 0);
        return doc.replace(from, to, slice);
      }

      default:
        throw new Error(`Unknown instruction type: ${(inst as AIEditInstruction).type}`);
    }
  }

  /**
   * Create a ProseMirror text node with optional marks.
   */
  private _createTextNode(
    content: string,
    markSpecs: MarkSpec[] | undefined,
    schema: Schema,
  ): PMNode {
    if (!markSpecs || markSpecs.length === 0) {
      return schema.text(content);
    }

    const marks: Mark[] = markSpecs.map((spec) => {
      const markType = schema.marks[spec.type];
      if (!markType) {
        throw new Error(`Unknown mark type: ${spec.type}`);
      }
      return markType.create(spec.attrs);
    });

    return schema.text(content, marks);
  }
}
