'use client';

/**
 * useDocumentAI Hook
 *
 * Binds the DocumentAI service to the TipTap editor instance.
 * Provides operation execution, diff accept/reject, and cleanup.
 * Handles offline/online transitions with abort + retry.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { OperationType } from '@inkwell/shared';
import { DiffPreviewPluginKey, AIOperationSession, clampPosition } from '@inkwell/editor';
import { getDocumentAI, destroyDocumentAI } from '../lib/document-ai-instance';
import { useDocumentStore } from '../lib/document-store';
import { useSettingsStore } from '../lib/settings-store';

interface UseDocumentAIOptions {
  editor: Editor | null;
}

/**
 * React hook that connects the DocumentAI runtime to an editor instance.
 *
 * Tracks online/offline state and aborts in-flight operations
 * when connectivity is lost mid-stream.
 */
export function useDocumentAI({ editor }: UseDocumentAIOptions) {
  const [isReady, setIsReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const sessionRef = useRef<AIOperationSession | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const claudeApiKey = useSettingsStore((s) => s.claudeApiKey);
  // Track the last failed operation for retry
  const lastOpRef = useRef<{ operation: OperationType; args?: string } | null>(null);

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
  }, [claudeApiKey]);

  // Track online/offline status and abort in-flight requests on disconnect
  useEffect(() => {
    const goOffline = () => {
      setIsLocalMode(true);
      // Abort any in-flight operation when going offline
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
    const goOnline = () => {
      setIsLocalMode(false);
      setLastError(null);
    };
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

      // Abort any previous in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsProcessing(true);
      setLastError(null);
      lastOpRef.current = { operation, args };

      try {
        const service = getDocumentAI();
        const { from, to } = editor.state.selection;
        const docContent = editor.state.doc.textContent;
        const selectionText = editor.state.doc.textBetween(from, to, '\n');
        const docId = useDocumentStore.getState().documentId ?? undefined;

        const result = await service.executeOperation({
          operation,
          docContent,
          cursorPos: from,
          selection: { from, to, text: selectionText },
          targetTone: args,
          docId,
        });

        // Check if aborted while awaiting
        if (controller.signal.aborted) {
          return;
        }

        if (result.instructions.length > 0 && editor) {
          // Show diff preview
          const tr = editor.state.tr.setMeta(DiffPreviewPluginKey, {
            instructions: result.instructions,
          });
          editor.view.dispatch(tr);
        }

        // Successful — clear retry ref
        lastOpRef.current = null;
      } catch (err) {
        if (controller.signal.aborted) {
          setLastError('Operation interrupted — connection lost.');
        } else {
          setLastError(
            err instanceof Error ? err.message : 'AI operation failed.',
          );
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setIsProcessing(false);
      }
    },
    [editor, isReady],
  );

  /**
   * Retry the last failed operation (e.g., after reconnecting).
   */
  const retryLastOperation = useCallback(() => {
    if (!lastOpRef.current) return;
    const { operation, args } = lastOpRef.current;
    executeOperation(operation, args);
  }, [executeOperation]);

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

      const clampedFrom = clampPosition(from, state.doc);
      const clampedTo = clampPosition(to, state.doc);
      const safeFrom = Math.min(clampedFrom, clampedTo);
      const safeTo = Math.max(clampedFrom, clampedTo);

      switch (inst.type) {
        case 'replace':
          tr = state.tr.insertText(inst.content || '', safeFrom, safeTo);
          break;
        case 'insert':
          tr = state.tr.insertText(inst.content || '', safeFrom);
          break;
        case 'delete':
          if (safeTo <= safeFrom) {
            continue;
          }
          tr = state.tr.delete(safeFrom, safeTo);
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
    lastError,
    executeOperation,
    retryLastOperation,
    acceptDiff,
    rejectDiff,
  };
}
