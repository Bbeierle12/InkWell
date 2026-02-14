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
import { GhostTextPluginKey, shouldUpdateGhostText } from '@inkwell/editor';
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
  const suggestionRef = useRef<{ text: string; pos: number } | null>(null);

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

      // Clear existing ghost text and tracked suggestion
      suggestionRef.current = null;
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
            // Skip update if the new suggestion is too similar (prevents flicker)
            const previousText = suggestionRef.current?.text ?? '';
            if (!shouldUpdateGhostText(previousText, result.raw)) {
              return;
            }
            suggestionRef.current = { text: result.raw, pos: from };
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

    const suggestion = suggestionRef.current;
    if (!suggestion) return;

    // Insert the ghost text suggestion at the recorded position
    const insertTr = editor.state.tr.insertText(suggestion.text, suggestion.pos);
    // Clear ghost text decoration via meta on the same transaction
    insertTr.setMeta(GhostTextPluginKey, null);
    editor.view.dispatch(insertTr);
    suggestionRef.current = null;
  }, [editor]);

  const dismiss = useCallback(() => {
    if (!editor) return;
    suggestionRef.current = null;
    const tr = editor.state.tr.setMeta(GhostTextPluginKey, null);
    editor.view.dispatch(tr);
  }, [editor]);

  return { accept, dismiss };
}
