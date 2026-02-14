'use client';

/**
 * Editor Component
 *
 * Main TipTap editor wrapper that integrates the @inkwell/editor
 * package with React and the DocumentAI service.
 */
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { OperationType } from '@inkwell/shared';
import {
  GhostText,
  DiffPreview,
  DiffPreviewPluginKey,
  AIUndo,
  SlashCommands,
} from '@inkwell/editor';
import type { SlashCommandItem } from '@inkwell/editor';
import { useDocumentAI } from '../hooks/useDocumentAI';
import { useGhostText } from '../hooks/useGhostText';
import { useCallback, useEffect, useRef, useState } from 'react';

const defaultCommands: SlashCommandItem[] = [
  { title: 'Rewrite', description: 'Rewrite selection in a new tone', command: 'rewrite' },
  { title: 'Summarize', description: 'Condense selected text', command: 'summarize' },
  { title: 'Expand', description: 'Elaborate on selected text', command: 'expand' },
  { title: 'Critique', description: 'Get feedback on selected text', command: 'critique' },
];

const operationMap: Record<string, OperationType> = {
  rewrite: OperationType.Rewrite,
  summarize: OperationType.Summarize,
  expand: OperationType.Expand,
  critique: OperationType.Critique,
};

export function Editor() {
  const executeRef = useRef<(op: OperationType, args?: string) => void>(() => {});
  const [hasDiffActive, setHasDiffActive] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      GhostText,
      DiffPreview,
      AIUndo,
      SlashCommands.configure({
        commands: defaultCommands,
        onExecute: (command: string, args: string) => {
          const operation = operationMap[command];
          if (operation) {
            executeRef.current(operation, args);
          }
        },
      }),
    ],
    content: '<p>Start writing...</p>',
    editorProps: {
      attributes: {
        class: 'min-h-[60vh] outline-none prose prose-lg max-w-none',
        role: 'textbox',
        'aria-label': 'Document editor',
        'aria-multiline': 'true',
      },
    },
  });

  const { isReady, executeOperation, acceptDiff, rejectDiff } = useDocumentAI({ editor });
  useGhostText({ editor, enabled: isReady });

  const handleSlashCommand = useCallback(
    (operation: OperationType, args?: string) => {
      executeOperation(operation, args);
    },
    [executeOperation],
  );

  // Keep the ref current so the SlashCommands closure always calls the latest handler
  useEffect(() => {
    executeRef.current = handleSlashCommand;
  }, [handleSlashCommand]);

  // Track diff preview active state to conditionally show buttons
  useEffect(() => {
    if (!editor) return;

    const checkDiffState = () => {
      const pluginState = DiffPreviewPluginKey.getState(editor.state);
      setHasDiffActive(!!pluginState?.active);
    };

    editor.on('transaction', checkDiffState);
    return () => {
      editor.off('transaction', checkDiffState);
    };
  }, [editor]);

  return (
    <div className="prose prose-lg max-w-none">
      <div data-testid="inkwell-editor">
        <EditorContent editor={editor} />
      </div>
      {editor && hasDiffActive && (
        <div className="inkwell-diff-actions mt-2 flex gap-2" role="toolbar" aria-label="Diff actions">
          <button
            onClick={acceptDiff}
            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            aria-label="Accept AI changes"
          >
            Accept
          </button>
          <button
            onClick={rejectDiff}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            aria-label="Reject AI changes"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
