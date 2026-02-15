/**
 * Shared constants for the Inkwell word processor.
 */

/** Canary string that must never leave the local machine. */
export const PRIVACY_CANARY = 'CANARY_PRIVATE_DO_NOT_TRANSMIT';

/** Per-operation token budgets. */
export const TOKEN_BUDGETS = {
  inline: 4_000,
  documentOps: 16_000,
  critique: 32_000,
} as const;

/** Debounce delay before triggering inline suggestion (ms). */
export const DEBOUNCE_MS = 500;

/** Max Levenshtein ratio before ghost text is considered unstable. */
export const GHOST_TEXT_STABILITY_THRESHOLD = 0.4;

/** Time (ms) after which rendered tokens are considered "stable". */
export const GHOST_TEXT_STABILIZE_MS = 100;

/** Max silence (ms) before a stream is marked dead. */
export const STREAM_TIMEOUT_MS = 30_000;

/** Target time-to-first-token for local inference (ms). */
export const TTFT_TARGET_LOCAL_MS = 200;

/** Target time-to-first-token for cloud inference (ms). */
export const TTFT_TARGET_CLOUD_MS = 1500;

/** Fraction of remaining token budget allocated to workspace snippets. */
export const WORKSPACE_SNIPPET_RATIO = 0.2;

/** The 14 tracked system invariants. */
export const INVARIANT_IDS = [
  'schema-valid-after-operation',
  'serialize-deserialize-stable',
  'decorations-never-serialized',
  'undo-redo-exact-state',
  'ai-ops-single-undo-step',
  'no-orphaned-streams-after-close',
  'no-late-mutations-after-teardown',
  'private-docs-never-reach-cloud',
  'token-counts-match-claude-tokenizer',
  'reconciler-valid-or-reject',
  'queue-respects-token-budget',
  'stream-errors-no-partial-edits',
  'ghost-text-no-flicker',
  'remote-changes-no-suggestion-trigger',
] as const;
