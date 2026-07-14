/**
 * Grammar Check Extension
 *
 * Scans dirty blocks on a debounce with an injected, local, deterministic
 * engine; caches the results by block TEXT; and renders the issues as inline
 * squiggly decorations.
 *
 * The decorations are derived state — `issues[]` is the single source of truth,
 * and `issues[]` is recomputed from scratch (never mapped forward) on every doc
 * change. Every issue is verified against the live document before it is
 * rendered. See `state.ts` for the two rules this feature rests on.
 *
 * Framework-agnostic: no React, no direct engine import. The engine arrives via
 * the `check` option so this package never depends on `@inkwell/grammar`'s WASM
 * at runtime.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { DecorationSet } from '@tiptap/pm/view';
import type { GrammarIssue } from '@inkwell/grammar';
import {
  anchorIssues,
  buildDecorations,
  cacheSet,
  type AnchoredIssue,
  type EnabledKinds,
  type IssueCache,
} from './state';

export * from './state';
export * from './positions';

export interface GrammarCheckState {
  enabled: EnabledKinds;
  cache: IssueCache;
  issues: AnchoredIssue[];
  decorations: DecorationSet;
}

export const grammarCheckKey = new PluginKey<GrammarCheckState>('grammarCheck');

interface ScanResultMeta {
  type: 'scanResult';
  blockText: string;
  issues: GrammarIssue[];
}

interface SetEnabledMeta {
  type: 'setEnabled';
  enabled: EnabledKinds;
}

export type GrammarMeta = ScanResultMeta | SetEnabledMeta;

/** Transaction meta: a scan for `blockText` came back with `issues`. */
export function applyScanResult(blockText: string, issues: GrammarIssue[]): GrammarMeta {
  return { type: 'scanResult', blockText, issues };
}

/** Transaction meta: toggle which categories are shown. */
export function setGrammarEnabled(spelling: boolean, grammar: boolean): GrammarMeta {
  return { type: 'setEnabled', enabled: { spelling, grammar } };
}

export interface GrammarCheckOptions {
  /** Injected engine call. Deterministic, local, async. */
  check: (blockText: string) => Promise<GrammarIssue[]>;
  debounceMs: number;
  spelling: boolean;
  grammar: boolean;
}

/**
 * Build the raw ProseMirror plugin. Exported so it can be driven from a bare
 * `EditorState`/`EditorView` without booting a whole TipTap `Editor`.
 */
export function createGrammarCheckPlugin(options: GrammarCheckOptions): Plugin<GrammarCheckState> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Block texts with a scan currently in flight — prevents duplicate work. */
  const inFlight = new Set<string>();
  /** A scan can outlive the view; dispatching into a destroyed view throws. */
  let destroyed = false;

  return new Plugin<GrammarCheckState>({
    key: grammarCheckKey,

    state: {
      init: (_config, editorState) => {
        const enabled = { spelling: options.spelling, grammar: options.grammar };
        const cache: IssueCache = new Map();
        const issues = anchorIssues(editorState.doc, cache, enabled);
        return {
          enabled,
          cache,
          issues,
          decorations: buildDecorations(editorState.doc, issues),
        };
      },

      apply: (tr, prev) => {
        const meta = tr.getMeta(grammarCheckKey) as GrammarMeta | undefined;

        let cache = prev.cache;
        let enabled = prev.enabled;

        if (meta?.type === 'scanResult') {
          cache = cacheSet(cache, meta.blockText, meta.issues);
        } else if (meta?.type === 'setEnabled') {
          enabled = meta.enabled;
        } else if (!tr.docChanged) {
          // Nothing that anchoring depends on has moved: not the doc, not the
          // cache, not the enabled set. Keeping the previous state object (and
          // its DecorationSet) is what makes selection changes free and is what
          // keeps squigglies from flickering.
          return prev;
        }

        // Re-anchor from scratch against the new doc. anchorIssues() applies
        // the map-then-verify rule internally, so a stale cache entry can
        // never produce a misplaced decoration — it simply fails to match.
        const issues = anchorIssues(tr.doc, cache, enabled);

        return {
          enabled,
          cache,
          issues,
          decorations: buildDecorations(tr.doc, issues),
        };
      },
    },

    props: {
      decorations: (state) => grammarCheckKey.getState(state)?.decorations,
    },

    view: (view) => {
      const scan = () => {
        if (destroyed) return;
        const pluginState = grammarCheckKey.getState(view.state);
        if (!pluginState) return;
        if (!pluginState.enabled.spelling && !pluginState.enabled.grammar) return;

        const pending = new Set<string>();
        view.state.doc.descendants((block) => {
          if (!block.isTextblock) return true;
          const text = block.textContent;
          if (text.trim() === '') return false;
          if (pluginState.cache.has(text)) return false; // cache hit — already anchored
          if (inFlight.has(text)) return false;
          pending.add(text); // a Set: identical twin blocks are one scan
          return false;
        });

        for (const text of pending) {
          inFlight.add(text);
          void options
            .check(text)
            .then((issues) => {
              // The result is content-addressed: it is applied to whichever
              // blocks currently hold `text`, if any. If the user has since
              // retyped, it matches nothing and harmlessly disappears.
              if (destroyed) return;
              view.dispatch(
                view.state.tr.setMeta(grammarCheckKey, applyScanResult(text, issues)),
              );
            })
            .catch(() => {
              // Engine failure is non-fatal: no squigglies, no crash. Nothing is
              // cached, so the text stays eligible for a later rescan.
            })
            .finally(() => {
              inFlight.delete(text);
            });
        }
      };

      const schedule = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(scan, options.debounceMs);
      };

      schedule(); // scan the initial document

      return {
        update: (updatedView: EditorView, prevState) => {
          const docChanged = !updatedView.state.doc.eq(prevState.doc);

          // Enabling a category is not a doc change, but it does create work:
          // blocks skipped while the feature was off have never been scanned.
          // Without this, turning grammar check on would show nothing until the
          // user's next keystroke.
          const before = grammarCheckKey.getState(prevState)?.enabled;
          const after = grammarCheckKey.getState(updatedView.state)?.enabled;
          const enabledChanged =
            before?.spelling !== after?.spelling || before?.grammar !== after?.grammar;

          if (docChanged || enabledChanged) schedule();
        },
        destroy: () => {
          destroyed = true;
          if (timer) clearTimeout(timer);
        },
      };
    },
  });
}

/**
 * TipTap extension that renders local grammar/spelling issues as decorations.
 *
 * Usage:
 * - Provide the engine: `GrammarCheck.configure({ check: (t) => engine.check(t) })`
 * - Toggle categories: `tr.setMeta(grammarCheckKey, setGrammarEnabled(true, false))`
 * - Read the live issues: `grammarCheckKey.getState(state).issues`
 */
export const GrammarCheck = Extension.create<GrammarCheckOptions>({
  name: 'grammarCheck',

  addOptions() {
    return {
      check: async () => [],
      debounceMs: 500,
      spelling: true,
      grammar: true,
    };
  },

  addProseMirrorPlugins() {
    return [createGrammarCheckPlugin(this.options)];
  },
});
