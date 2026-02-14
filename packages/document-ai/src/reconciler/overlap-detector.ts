/**
 * Overlap Detector
 *
 * Detects overlapping ranges in AI edit instructions using a sweep-line approach.
 * Two instructions overlap when one's range intersects the other's non-trivially.
 * Two inserts at the same point (from === to) are NOT considered overlapping.
 */
import type { AIEditInstruction } from '@inkwell/shared';

export interface OverlapResult {
  indices: [number, number];
}

/**
 * Detect overlapping ranges among instructions.
 *
 * Sorts instructions by `from` ascending, then scans for cases where
 * `curr.from < prev.to` (meaning the current instruction starts inside
 * the previous one's range). Pure inserts (from === to) at the same
 * position are not considered overlapping.
 *
 * @returns The first pair of overlapping instruction indices, or null if none.
 */
export function detectOverlaps(
  instructions: AIEditInstruction[],
): OverlapResult | null {
  if (instructions.length < 2) return null;

  // Create index-tagged entries so we can report original indices
  const indexed = instructions.map((inst, i) => ({ inst, originalIndex: i }));

  // Sort by from ascending, then by to descending (wider ranges first)
  indexed.sort((a, b) => {
    const diff = a.inst.range.from - b.inst.range.from;
    if (diff !== 0) return diff;
    return b.inst.range.to - a.inst.range.to;
  });

  // Sweep: track the furthest `to` seen and which instruction produced it
  let maxTo = indexed[0].inst.range.to;
  let maxToIdx = indexed[0].originalIndex;

  for (let i = 1; i < indexed.length; i++) {
    const curr = indexed[i];
    const currFrom = curr.inst.range.from;
    const currTo = curr.inst.range.to;

    // Two inserts at the same point are fine
    const prevIsInsert = indexed[i - 1].inst.range.from === indexed[i - 1].inst.range.to;
    const currIsInsert = currFrom === currTo;
    if (prevIsInsert && currIsInsert && currFrom === indexed[i - 1].inst.range.from) {
      // Update maxTo tracking and continue
      if (currTo > maxTo) {
        maxTo = currTo;
        maxToIdx = curr.originalIndex;
      }
      continue;
    }

    // Overlap: current starts before the furthest end we've seen
    if (currFrom < maxTo) {
      return {
        indices: [maxToIdx, curr.originalIndex],
      };
    }

    if (currTo > maxTo) {
      maxTo = currTo;
      maxToIdx = curr.originalIndex;
    }
  }

  return null;
}
