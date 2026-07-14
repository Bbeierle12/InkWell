import { useCallback, useEffect, useMemo } from 'react';
import type { GrammarIssue } from '@inkwell/grammar';
import { useSettingsStore } from '@/lib/settings-store';
import { getGrammarEngine } from '@/lib/grammar-instance';

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

  // Replay persisted dictionary + ignores into the engine.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const engine = getGrammarEngine();
    void (async () => {
      await engine.setup();
      if (dictionary.length > 0) {
        // importWords is a significant operation — batch it, never per-word.
        await Promise.all(dictionary.map((w) => engine.addWord(w)));
      }
      if (ignoredLints) {
        await engine.importIgnored(ignoredLints);
      }
    })();
  }, [dictionary, ignoredLints]);

  const check = useCallback(async (blockText: string): Promise<GrammarIssue[]> => {
    if (typeof window === 'undefined') return [];
    return getGrammarEngine().check(blockText);
  }, []);

  return useMemo(() => ({ check, spelling, grammar }), [check, spelling, grammar]);
}
