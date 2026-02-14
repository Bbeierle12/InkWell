/**
 * Schema Validator
 *
 * Validates AI-produced edit instructions against structural rules.
 * This is a pre-check before applying instructions to the actual document.
 * Rejects instructions that have invalid structure, ranges, or missing content.
 *
 * Ref: Invariant: reconciler-valid-or-reject
 */
import type { AIEditInstruction } from '@inkwell/shared';

const VALID_TYPES = new Set(['replace', 'insert', 'delete']);

/**
 * Validate that instructions have valid structure.
 * Returns null if valid, or an error message string if invalid.
 *
 * Checks:
 * - Each instruction has a valid type ('replace', 'insert', 'delete')
 * - Each instruction has a range with numeric from and to
 * - Ranges are non-negative
 * - from <= to (for replace/delete) or from === to (for insert)
 * - Content is provided for 'replace' and 'insert' types
 * - Content is a string when provided
 * - Marks, if provided, is an array of objects with a string `type` field
 */
export function validateInstructions(
  instructions: AIEditInstruction[],
  schema?: { marks: Record<string, unknown> } | null,
): string | null {
  if (!Array.isArray(instructions)) {
    return 'Instructions must be an array';
  }

  for (let i = 0; i < instructions.length; i++) {
    const inst = instructions[i];
    const prefix = `Instruction [${i}]`;

    // Check type
    if (!inst || typeof inst !== 'object') {
      return `${prefix}: must be an object`;
    }

    if (!VALID_TYPES.has(inst.type)) {
      return `${prefix}: invalid type "${inst.type}", must be one of: replace, insert, delete`;
    }

    // Check range
    if (!inst.range || typeof inst.range !== 'object') {
      return `${prefix}: missing or invalid range`;
    }

    const { from, to } = inst.range;

    if (typeof from !== 'number' || typeof to !== 'number') {
      return `${prefix}: range.from and range.to must be numbers`;
    }

    if (from < 0 || to < 0) {
      return `${prefix}: range values must be non-negative (from=${from}, to=${to})`;
    }

    if (from > to) {
      return `${prefix}: range.from (${from}) must be <= range.to (${to})`;
    }

    // Insert: from must equal to
    if (inst.type === 'insert' && from !== to) {
      return `${prefix}: insert instruction must have from === to (from=${from}, to=${to})`;
    }

    // Content checks
    if (inst.type === 'replace' || inst.type === 'insert') {
      if (inst.content === undefined || inst.content === null) {
        return `${prefix}: ${inst.type} instruction must have content`;
      }
      if (typeof inst.content !== 'string') {
        return `${prefix}: content must be a string`;
      }
    }

    // Marks checks (optional)
    if (inst.marks !== undefined) {
      if (!Array.isArray(inst.marks)) {
        return `${prefix}: marks must be an array`;
      }
      for (let j = 0; j < inst.marks.length; j++) {
        const mark = inst.marks[j];
        if (!mark || typeof mark !== 'object') {
          return `${prefix}: marks[${j}] must be an object`;
        }
        if (typeof mark.type !== 'string') {
          return `${prefix}: marks[${j}].type must be a string`;
        }
        // Schema-aware mark type validation
        if (schema && !(mark.type in schema.marks)) {
          return `${prefix}: marks[${j}].type "${mark.type}" does not exist in schema`;
        }
      }
    }
  }

  return null;
}
