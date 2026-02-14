'use client';

/**
 * useDocumentAI Hook
 *
 * Binds the DocumentAI service to the TipTap editor instance.
 */

/**
 * React hook that connects the DocumentAI runtime to an editor instance.
 */
export function useDocumentAI() {
  // TODO: implement
  // - Get singleton DocumentAI instance
  // - Subscribe to editor changes
  // - Trigger AI operations on debounced input
  // - Clean up on unmount (invariant: no-late-mutations-after-teardown)
  return {
    isReady: false,
    isPaused: false,
    isLocalMode: false,
  };
}
