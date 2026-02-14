/**
 * Ghost Text Stability
 *
 * Prevents ghost text flickering by requiring new suggestions to be
 * sufficiently different from the previous one before updating the display.
 */
import { levenshteinRatio } from '@inkwell/shared';
import { GHOST_TEXT_STABILITY_THRESHOLD } from '@inkwell/shared';

/**
 * Determine whether a new ghost text suggestion should replace the current one.
 * Returns true if the new text is different enough to warrant an update.
 */
export function shouldUpdateGhostText(
  current: string,
  incoming: string,
): boolean {
  if (current === '') return true;
  if (incoming === '') return true;
  const ratio = levenshteinRatio(current, incoming);
  return ratio > GHOST_TEXT_STABILITY_THRESHOLD;
}
