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

interface UseAutoSaveOptions {
  editor: Editor | null;
  intervalMs?: number;
}

export function useAutoSave({ editor, intervalMs }: UseAutoSaveOptions) {
  const { isDirty, markDirty, save, autoSaveIntervalMs } = useDocumentStore();
  const interval = intervalMs ?? autoSaveIntervalMs;
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
    const timer = setInterval(() => {
      const currentEditor = editorRef.current;
      if (currentEditor && useDocumentStore.getState().isDirty) {
        save(currentEditor);
      }
    }, interval);

    return () => clearInterval(timer);
  }, [interval, save]);

  return { isDirty };
}
