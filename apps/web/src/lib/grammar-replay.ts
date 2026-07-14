/**
 * Pure replay-ordering logic for `useGrammar`.
 *
 * Extracted so the ORDER of operations — setup, then dictionary import, then
 * ignore-list import — is independently testable without a DOM/worker. The
 * hook awaits this promise from `check()` before ever calling `engine.check()`,
 * which is what prevents a cold-start scan from racing ahead of the replay
 * (see useGrammar.ts for the full race explanation).
 *
 * Only the subset of GrammarEngine this needs is modeled here, so tests can
 * pass a plain mock instead of a real (WASM-backed) engine.
 */
export interface ReplayEngine {
  setup(): Promise<void>;
  addWord(word: string): Promise<void>;
  importIgnored(json: string): Promise<void>;
}

/**
 * Replay the persisted personal dictionary + ignore-list into `engine`, in
 * the order Harper requires: setup MUST complete before any import call, and
 * the dictionary import happens before the ignore-list import (arbitrary
 * relative to each other, but fixed so tests can assert a single order).
 */
export async function buildReplay(
  engine: ReplayEngine,
  dictionary: readonly string[],
  ignoredLints: string | null | undefined,
): Promise<void> {
  await engine.setup();
  if (dictionary.length > 0) {
    // importWords is a significant operation — batch it, never per-word.
    await Promise.all(dictionary.map((w) => engine.addWord(w)));
  }
  if (ignoredLints) {
    await engine.importIgnored(ignoredLints);
  }
}
