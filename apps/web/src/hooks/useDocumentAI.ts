'use client';

/**
 * useDocumentAI Hook
 *
 * Binds the DocumentAI service to the TipTap editor instance.
 * Provides operation execution, diff accept/reject, and cleanup.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { OperationType } from '@inkwell/shared';
import { DiffPreviewPluginKey } from '@inkwell/editor';
import { AIOperationSession } from '@inkwell/editor';
import { getDocumentAI, destroyDocumentAI } from '../lib/document-ai-instance';

interface UseDocumentAIOptions {
  editor: Editor | null;
}

/**
 * React hook that connects the DocumentAI runtime to an editor instance.
 */
export function useDocumentAI({ editor }: UseDocumentAIOptions) {
  const [isReady, setIsReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const sessionRef = useRef<AIOperationSession | null>(null);

  useEffect(() => {
    try {
      getDocumentAI();
      setIsReady(true);
    } catch {
      setIsReady(false);
    }

    return () => {
      destroyDocumentAI();
    };
  }, []);

  // Track online/offline status
  useEffect(() => {
    const goOffline = () => setIsLocalMode(true);
    const goOnline = () => setIsLocalMode(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  const executeOperation = useCallback(
    async (operation: OperationType, args?: string) => {
      if (!editor || !isReady) return;

      setIsProcessing(true);
      try {
        const service = getDocumentAI();
        const { from, to } = editor.state.selection;
        const docContent = editor.state.doc.textContent;
        const selectionText = editor.state.doc.textBetween(from, to, '\n');

        const result = await service.executeOperation({
          operation,
          docContent,
          cursorPos: from,
          selection: { from, to, text: selectionText },
          targetTone: args,
        });

        if (result.instructions.length > 0 && editor) {
          // Show diff preview
          const tr = editor.state.tr.setMeta(DiffPreviewPluginKey, {
            instructions: result.instructions,
          });
          editor.view.dispatch(tr);
        }
      } finally {
        setIsProcessing(false);
      }
    },
    [editor, isReady],
  );

  const acceptDiff = useCallback(() => {
    if (!editor) return;

    const pluginState = DiffPreviewPluginKey.getState(editor.state);
    if (!pluginState?.active) return;

    const instructions = pluginState.instructions;

    // Create an AIOperationSession for single undo step
    const session = new AIOperationSession(editor.state);

    // Apply all instructions as intermediate (no history)
    let state = editor.state;
    for (const inst of instructions) {
      const { from, to } = inst.range;
      let tr;

      switch (inst.type) {
        case 'replace':
          tr = state.tr.replaceWith(
            from,
            to,
            inst.content ? state.schema.text(inst.content) : state.doc.type.schema.text(''),
          );
          break;
        case 'insert':
          tr = state.tr.insertText(inst.content || '', from);
          break;
        case 'delete':
          tr = state.tr.delete(from, to);
          break;
        default:
          continue;
      }

      state = session.applyIntermediate(state, tr);
    }

    // Commit as single undo step
    state = session.commit(state);

    // Clear the diff preview
    const clearTr = state.tr.setMeta(DiffPreviewPluginKey, { reject: true });
    editor.view.updateState(state.apply(clearTr));
  }, [editor]);

  const rejectDiff = useCallback(() => {
    if (!editor) return;

    const tr = editor.state.tr.setMeta(DiffPreviewPluginKey, { reject: true });
    editor.view.dispatch(tr);
  }, [editor]);

  return {
    isReady,
    isPaused,
    isLocalMode,
    isProcessing,
    executeOperation,
    acceptDiff,
    rejectDiff,
  };
}
