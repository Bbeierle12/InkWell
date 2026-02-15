'use client';

/**
 * ExportMenu Component
 *
 * Dropdown menu for exporting documents as Markdown.
 * In Tauri (desktop), also provides native Save/Open file dialogs.
 */

import { useState, useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import { editorJsonToMarkdown } from '@/lib/markdown-export';
import { isTauriEnvironment, saveToFile, openFromFile } from '@/lib/tauri-bridge';

interface ExportMenuProps {
  editor: Editor | null;
}

export function ExportMenu({ editor }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const getMarkdown = useCallback(() => {
    if (!editor) return '';
    return editorJsonToMarkdown(editor.getJSON() as Record<string, unknown>);
  }, [editor]);

  const handleCopyMarkdown = useCallback(async () => {
    const md = getMarkdown();
    try {
      await navigator.clipboard.writeText(md);
      showToast('Copied to clipboard');
    } catch {
      showToast('Copy failed');
    }
    setIsOpen(false);
  }, [getMarkdown, showToast]);

  const handleDownloadMarkdown = useCallback(() => {
    const md = getMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.md';
    a.click();
    URL.revokeObjectURL(url);
    setIsOpen(false);
    showToast('Download started');
  }, [getMarkdown, showToast]);

  const handleSaveToFile = useCallback(async () => {
    const md = getMarkdown();
    try {
      await saveToFile(md, [{ name: 'Markdown', extensions: ['md'] }]);
      showToast('File saved');
    } catch {
      showToast('Save failed');
    }
    setIsOpen(false);
  }, [getMarkdown, showToast]);

  const handleOpenFromFile = useCallback(async () => {
    if (!editor) return;
    try {
      const content = await openFromFile([{ name: 'Markdown', extensions: ['md', 'txt'] }]);
      if (content) {
        // Insert file content as plain text
        editor.commands.setContent(`<p>${content}</p>`);
        showToast('File opened');
      }
    } catch {
      showToast('Open failed');
    }
    setIsOpen(false);
  }, [editor, showToast]);

  const isTauri = isTauriEnvironment();

  return (
    <div className="relative">
      <button
        className="inkwell-toolbar-btn"
        onClick={() => setIsOpen((o) => !o)}
        disabled={!editor}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Export options"
        title="Export"
      >
        Export
      </button>
      {isOpen && (
        <div className="inkwell-dropdown" role="menu" aria-label="Export menu">
          <button
            className="inkwell-dropdown-item"
            role="menuitem"
            onClick={handleCopyMarkdown}
          >
            Copy as Markdown
          </button>
          <button
            className="inkwell-dropdown-item"
            role="menuitem"
            onClick={handleDownloadMarkdown}
          >
            Download as Markdown
          </button>
          {isTauri && (
            <>
              <div className="inkwell-dropdown-divider" />
              <button
                className="inkwell-dropdown-item"
                role="menuitem"
                onClick={handleSaveToFile}
              >
                Save to File...
              </button>
              <button
                className="inkwell-dropdown-item"
                role="menuitem"
                onClick={handleOpenFromFile}
              >
                Open File...
              </button>
            </>
          )}
        </div>
      )}
      {toast && (
        <div className="inkwell-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
