'use client';

/**
 * useAutoSave Hook
 *
 * Auto-saves the editor content at a regular interval when dirty.
 * Marks the document dirty on every editor update.
 */

import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { useDocumentStore } from '../lib/document-store';
import { useSettingsStore } from '../lib/settings-store';

interface UseAutoSaveOptions {
  editor: Editor | null;
}

export function useAutoSave({ editor }: UseAutoSaveOptions) {
  const { isDirty, markDirty, save } = useDocumentStore();
  const { autoSaveEnabled, autoSaveIntervalMs } = useSettingsStore();
  const editorRef = useRef(editor);
  editorRef.current = editor;

  // Mark dirty on editor updates
  useEffect(() => {
    if (!editor) return;

    const handler = () => markDirty();
    editor.on('update', handler);
    return () => {
      editor.off('update', handler);
    };
  }, [editor, markDirty]);

  // Auto-save interval
  useEffect(() => {
    if (!autoSaveEnabled) return;

    const timer = setInterval(() => {
      const currentEditor = editorRef.current;
      if (currentEditor && useDocumentStore.getState().isDirty) {
        save(currentEditor);
      }
    }, autoSaveIntervalMs);

    return () => clearInterval(timer);
  }, [autoSaveEnabled, autoSaveIntervalMs, save]);

  return { isDirty };
}
