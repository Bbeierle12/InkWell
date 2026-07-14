import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { GrammarIssue } from '@inkwell/grammar';
import { useSettingsStore } from '@/lib/settings-store';
import { getGrammarEngine } from '@/lib/grammar-instance';
import { buildReplay } from '@/lib/grammar-replay';

/**
 * Bridges the settings store to the grammar engine.
 *
 * The dictionary and ignore-list live in the engine (Harper owns them natively);
 * the store is just their persistence layer. On mount, replay the persisted
 * state into the engine.
 */
export function useGrammar() {
  const spelling = useSettingsStore((s) => s.grammarSpelling);
  const grammar = useSettingsStore((s) => s.grammarGrammar);
  const dictionary = useSettingsStore((s) => s.grammarDictionary);
  const ignoredLints = useSettingsStore((s) => s.grammarIgnoredLints);

  // Replay persisted dictionary + ignores into the engine. `check()` awaits
  // this promise before scanning, so a cold-start scan can never race ahead
  // of the replay (see readyRef below).
  const readyRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const engine = getGrammarEngine();
    readyRef.current = buildReplay(engine, dictionary, ignoredLints);
  }, [dictionary, ignoredLints]);

  const check = useCallback(async (blockText: string): Promise<GrammarIssue[]> => {
    if (typeof window === 'undefined') return [];
    // Ensure the persisted ignore-list + dictionary are applied before the
    // first scan, or a cold-start scan (debounce < Harper setup time) would
    // re-surface previously-dismissed issues and cache them (§5.4a).
    if (readyRef.current) await readyRef.current;
    return getGrammarEngine().check(blockText);
  }, []);

  return useMemo(() => ({ check, spelling, grammar }), [check, spelling, grammar]);
}
