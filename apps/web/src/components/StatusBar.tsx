'use client';

/**
 * StatusBar — bottom strip with save state, counts, ghost-text
 * indicator, autosave info, and zoom controls.
 */

import { useState, useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { useDocumentStore } from '@/lib/document-store';
import { useSettingsStore } from '@/lib/settings-store';
import { countWords, formatRelativeTime } from '@/lib/document-utils';

interface StatusBarProps {
  editor: Editor | null;
}

export function StatusBar({ editor }: StatusBarProps) {
  const { isDirty, lastSavedAt } = useDocumentStore();
  const { showWordCount, showCharCount, ghostTextEnabled } = useSettingsStore();
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    if (!editor) return;

    const updateCounts = () => {
      const text = editor.getText();
      setWordCount(countWords(text));
      setCharCount(text.length);
    };

    updateCounts();
    editor.on('update', updateCounts);
    return () => {
      editor.off('update', updateCounts);
    };
  }, [editor]);

  const saveLabel = isDirty ? 'Saving…' : lastSavedAt ? 'Saved' : '';
  const lastSavedLabel = lastSavedAt
    ? `autosaved ${formatRelativeTime(lastSavedAt)}`
    : 'unsaved';

  return (
    <footer className="inkwell-status-bar" role="contentinfo" aria-label="Document status">
      {saveLabel && (
        <span
          className={`inkwell-status-save ${
            isDirty ? 'inkwell-status-unsaved' : 'inkwell-status-saved'
          }`}
          aria-label={saveLabel}
        >
          <span aria-hidden="true">●</span>
          {saveLabel}
        </span>
      )}
      {showWordCount && (
        <span className="inkwell-status-seg" aria-label={`${wordCount} words`}>
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
          {showCharCount && (
            <span style={{ color: 'var(--ink-4)' }}>· {charCount} chars</span>
          )}
        </span>
      )}
      {ghostTextEnabled && (
        <span className="inkwell-status-seg" style={{ color: 'var(--accent)' }}>
          <span aria-hidden="true">●</span>
          Ghost text on
        </span>
      )}
      <span className="inkwell-status-spacer" />
      <span className="inkwell-status-seg" style={{ color: 'var(--ink-4)' }}>
        {lastSavedLabel}
      </span>
      <div className="inkwell-status-zoom">
        <button type="button" className="inkwell-status-zoom-btn" aria-label="Zoom out">
          −
        </button>
        <span>100%</span>
        <button type="button" className="inkwell-status-zoom-btn" aria-label="Zoom in">
          +
        </button>
      </div>
    </footer>
  );
}
