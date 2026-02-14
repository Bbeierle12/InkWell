/**
 * Position Mapper
 *
 * Remaps stale positions from AI output to current document positions.
 * When an AI request is made, the document may have been edited concurrently.
 * This module adjusts positions from the document state at request time
 * to the current document state.
 */

export interface PositionChange {
  from: number;
  to: number;
  insertLength: number;
}

/**
 * Remap a position from the document state at request time
 * to the current document state.
 *
 * Changes are processed in order. For each change, if the original position
 * is after the change's `from`, we adjust by the net difference:
 * (insertLength - deletedLength), where deletedLength = to - from.
 *
 * @param originalPos - The position in the document as it was when AI made its request
 * @param changes - Array of changes that happened since the AI request was made
 * @returns The remapped position in the current document
 */
export function remapPosition(
  originalPos: number,
  changes: Array<PositionChange>,
): number {
  let pos = originalPos;

  for (const change of changes) {
    const deletedLength = change.to - change.from;
    const delta = change.insertLength - deletedLength;

    // For pure insertions (from === to), positions at from are pushed forward.
    // For deletions/replacements (from < to), positions at from stay put
    // (they are at the boundary before the affected range).
    const isInsertion = change.from === change.to;

    if (isInsertion) {
      // Pure insertion: push positions at or after `from`
      if (pos >= change.from) {
        pos += change.insertLength;
      }
    } else if (pos > change.from) {
      // Deletion or replacement: only affect positions strictly after `from`
      if (pos <= change.to) {
        // Position is within the deleted range — map to end of insertion
        pos = change.from + change.insertLength;
      } else {
        // Position is after the entire change
        pos += delta;
      }
    }
  }

  return pos;
}

/**
 * Check if a position falls within a range that was deleted by concurrent changes.
 *
 * A "deleted range" is a change where content was removed (to > from)
 * and nothing was inserted (insertLength === 0).
 *
 * @param originalPos - The position to check (in the original document coordinate space)
 * @param changes - Array of concurrent changes
 * @returns true if the position is inside a purely-deleted range
 */
export function isPositionInDeletedRange(
  originalPos: number,
  changes: Array<PositionChange>,
): boolean {
  for (const change of changes) {
    // Only consider pure deletions (no insertion)
    if (change.to > change.from && change.insertLength === 0) {
      if (originalPos > change.from && originalPos <= change.to) {
        return true;
      }
    }
  }
  return false;
}
