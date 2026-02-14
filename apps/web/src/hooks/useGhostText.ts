'use client';

/**
 * useGhostText Hook
 *
 * Manages the ghost text lifecycle: request, render, accept, dismiss.
 * Requests inline suggestions on cursor idle, renders them as decorations,
 * and handles accept (Tab) / dismiss (continued typing).
 *
 * When running in a Tauri environment with a local model loaded,
 * ghost text streams progressively as tokens arrive.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { OperationType } from '@inkwell/shared';
import { DEBOUNCE_MS } from '@inkwell/shared';
import { GhostTextPluginKey } from '@inkwell/editor';
import { getDocumentAI } from '../lib/document-ai-instance';

interface UseGhostTextOptions {
  editor: Editor | null;
  enabled?: boolean;
}

/**
 * React hook that manages ghost text suggestions in the editor.
 */
export function useGhostText({ editor, enabled = true }: UseGhostTextOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!editor || !enabled) return;

    const handleUpdate = () => {
      // Clear existing timer and abort pending request
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }

      // Clear existing ghost text
      const clearTr = editor.state.tr.setMeta(GhostTextPluginKey, null);
      editor.view.dispatch(clearTr);

      // Debounce before requesting new suggestion
      timerRef.current = setTimeout(async () => {
        try {
          const service = getDocumentAI();
          const { from } = editor.state.selection;
          const docContent = editor.state.doc.textContent;

          abortRef.current = new AbortController();
          const signal = abortRef.current.signal;

          const result = await service.executeOperation({
            operation: OperationType.InlineSuggest,
            docContent,
            cursorPos: from,
          });

          // If aborted during execution, don't update
          if (signal.aborted) return;

          if (result.raw && editor) {
            const tr = editor.state.tr.setMeta(GhostTextPluginKey, {
              text: result.raw,
              pos: from,
              requestedAt: performance.now(),
            });
            editor.view.dispatch(tr);
          }
        } catch {
          // Silently ignore — ghost text is best-effort
        }
      }, DEBOUNCE_MS);
    };

    editor.on('update', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [editor, enabled]);

  const accept = useCallback(() => {
    if (!editor) return;

    const ghostState = GhostTextPluginKey.getState(editor.state);
    if (!ghostState || ghostState === (editor.state as any).doc) return;

    // Ghost text decorations contain the suggestion — inserting at cursor
    // The actual accept logic depends on the decoration widget's text content
    // For now, clear the ghost text (actual insertion would read from decoration)
    const tr = editor.state.tr.setMeta(GhostTextPluginKey, null);
    editor.view.dispatch(tr);
  }, [editor]);

  const dismiss = useCallback(() => {
    if (!editor) return;
    const tr = editor.state.tr.setMeta(GhostTextPluginKey, null);
    editor.view.dispatch(tr);
  }, [editor]);

  return { accept, dismiss };
}
