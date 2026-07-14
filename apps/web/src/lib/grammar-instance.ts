import { createWorkerEngine, type GrammarEngine } from '@inkwell/grammar';

/**
 * Lazily-constructed browser singleton.
 *
 * Constructing the engine spins up a web worker and compiles Harper's WASM +
 * curated dictionary — the most expensive operation in the library. Do it once,
 * on first use, never during module evaluation (which would run during Next.js
 * SSR, where `Worker` does not exist).
 */
let engine: GrammarEngine | null = null;

export function getGrammarEngine(): GrammarEngine {
  if (typeof window === 'undefined') {
    throw new Error('getGrammarEngine() is browser-only');
  }
  if (!engine) {
    engine = createWorkerEngine();
    void engine.setup();
  }
  return engine;
}
