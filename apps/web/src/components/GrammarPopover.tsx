'use client';

/**
 * GrammarPopover — the click-to-fix surface for local grammar/spelling issues.
 *
 * This is the ONLY part of the grammar feature that writes to the document, so
 * the write itself lives in a separate, dependency-light, unit-tested module
 * (`@/lib/grammar-fix`). This component is deliberately thin: it does click
 * hit-testing, positioning, and wires the Ignore / Add-to-dictionary handlers.
 * All the write-safety risk lives in `applyFix`, which is tested without a DOM.
 */

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { grammarCheckKey, type AnchoredIssue } from '@inkwell/editor';
import { useSettingsStore } from '@/lib/settings-store';
import { getGrammarEngine } from '@/lib/grammar-instance';
import { applyFix } from '@/lib/grammar-fix';

export function GrammarPopover({ editor }: { editor: Editor | null }) {
  const [issue, setIssue] = useState<AnchoredIssue | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const addGrammarWord = useSettingsStore((s) => s.addGrammarWord);
  const setGrammarIgnoredLints = useSettingsStore((s) => s.setGrammarIgnoredLints);

  useEffect(() => {
    if (!editor) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const el = target.closest('[data-grammar-id]');
      if (!el) {
        setIssue(null);
        return;
      }
      const id = el.getAttribute('data-grammar-id');
      const pluginState = grammarCheckKey.getState(editor.state);
      const found = pluginState?.issues.find((i) => i.id === id) ?? null;
      setIssue(found);
      if (found) {
        const c = editor.view.coordsAtPos(found.from);
        setCoords({ top: c.bottom + window.scrollY, left: c.left + window.scrollX });
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener('click', onClick);
    return () => dom.removeEventListener('click', onClick);
  }, [editor]);

  if (!editor || !issue || !coords) return null;

  const close = () => setIssue(null);

  const onFix = (replacement: string) => {
    // Re-verify-before-write lives in applyFix: a stale squiggle returns null
    // and we dispatch nothing. Never corrupt the document.
    const tr = applyFix(editor.state, issue, replacement);
    if (tr) editor.view.dispatch(tr);
    close();
  };

  const onIgnore = async () => {
    const engine = getGrammarEngine();
    await engine.ignoreIssue(issue.originalText, issue.id);
    setGrammarIgnoredLints(await engine.exportIgnored());
    // TODO(Task 9): dispatch clearGrammarCache() so the dismissed issue doesn't reappear from cache
    close();
  };

  const onAddToDictionary = async () => {
    const engine = getGrammarEngine();
    await engine.addWord(issue.originalText);
    addGrammarWord(issue.originalText);
    // TODO(Task 9): dispatch clearGrammarCache() so the dismissed issue doesn't reappear from cache
    close();
  };

  return (
    <div
      className="inkwell-grammar-popover"
      style={{ position: 'absolute', top: coords.top, left: coords.left, zIndex: 50 }}
      role="dialog"
      aria-label="Grammar suggestion"
    >
      {issue.message && <p className="inkwell-grammar-popover-message">{issue.message}</p>}
      {issue.suggestions.length > 0 ? (
        <div className="inkwell-grammar-popover-suggestions">
          {issue.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="inkwell-grammar-popover-suggestion"
              onClick={() => onFix(s)}
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      <div className="inkwell-grammar-popover-actions">
        <button type="button" className="inkwell-grammar-popover-action" onClick={onIgnore}>
          Ignore
        </button>
        {issue.kind === 'spelling' && (
          <button
            type="button"
            className="inkwell-grammar-popover-action"
            onClick={onAddToDictionary}
          >
            Add to dictionary
          </button>
        )}
      </div>
    </div>
  );
}
