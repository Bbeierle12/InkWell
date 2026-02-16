'use client';

/**
 * StatusBar Component
 *
 * Thin bar at the bottom of the editor showing:
 * - Save status (Saved / Saving... / Unsaved changes)
 * - Word count
 * - Character count
 */

import { useState, useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { useDocumentStore } from '@/lib/document-store';
import { useSettingsStore } from '@/lib/settings-store';
import { countWords } from '@/lib/document-utils';

interface StatusBarProps {
  editor: Editor | null;
}

export function StatusBar({ editor }: StatusBarProps) {
  const { isDirty, lastSavedAt } = useDocumentStore();
  const { showWordCount, showCharCount } = useSettingsStore();
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

  const saveStatus = isDirty
    ? 'Unsaved changes'
    : lastSavedAt
      ? 'Saved'
      : '';

  return (
    <footer className="inkwell-status-bar" role="contentinfo" aria-label="Document status">
      {saveStatus && (
        <span
          className={`inkwell-status-save ${isDirty ? 'inkwell-status-unsaved' : 'inkwell-status-saved'}`}
          aria-label={saveStatus}
        >
          {isDirty ? '\u25CF' : '\u2713'} {saveStatus}
        </span>
      )}
      <div className="inkwell-status-spacer" />
      {showWordCount && (
        <span className="inkwell-status-count" aria-label={`${wordCount} words`}>
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>
      )}
      {showCharCount && (
        <span className="inkwell-status-count" aria-label={`${charCount} characters`}>
          {charCount} {charCount === 1 ? 'char' : 'chars'}
        </span>
      )}
    </footer>
  );
}
