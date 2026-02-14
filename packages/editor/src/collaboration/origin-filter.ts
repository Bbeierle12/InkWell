/**
 * Origin Filter
 *
 * Suppresses AI suggestion triggers when changes originate from
 * remote collaborators (to avoid suggesting edits on someone else's typing).
 */

/**
 * Determine if a Y.js change should trigger AI suggestions.
 * Returns true for local-origin changes, false for remote-origin changes.
 *
 * Y.js convention:
 * - Local transactions set origin to null, undefined, or the local provider instance.
 * - Remote transactions set origin to the remote provider or a string like 'remote'.
 *
 * When the origin type is unknown, we default to true (local) as a safe fallback.
 * This may trigger unnecessary suggestions but will never suppress needed ones.
 *
 * Ref: Invariant: remote-changes-no-suggestion-trigger
 */
export function originFilter(origin: unknown): boolean {
  // Local changes: origin is null or undefined (no provider set)
  if (origin === null || origin === undefined) {
    return true;
  }

  // Remote string origin: Y.js providers commonly use 'remote' as origin
  if (typeof origin === 'string' && origin === 'remote') {
    return false;
  }

  // Object with isLocal flag: explicit local/remote indicator
  if (typeof origin === 'object' && origin !== null && 'isLocal' in origin) {
    return (origin as { isLocal: boolean }).isLocal;
  }

  // Default: treat unknown origins as local (safe — may trigger
  // unnecessary suggestions but won't suppress needed ones)
  return true;
}
