'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { OperationType } from '@inkwell/shared';
import {
  GhostText,
  DiffPreview,
  DiffPreviewPluginKey,
  AIUndo,
  SlashCommands,
} from '@inkwell/editor';
import type { SlashCommandItem } from '@inkwell/editor';

import { Toolbar } from '@/components/Toolbar';
import { BackpressureIndicator } from '@/components/BackpressureIndicator';
import { EditorArea } from '@/components/EditorArea';
import { SetupScreen } from '@/components/SetupScreen';
import { useDocumentAI } from '@/hooks/useDocumentAI';
import { useGhostText } from '@/hooks/useGhostText';
import { useVoicePipeline } from '@/hooks/useVoicePipeline';
import { useAutoSave } from '@/hooks/useAutoSave';
import { isTauriEnvironment, checkModelsStatus } from '@/lib/tauri-bridge';

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

export default function Home() {
  const executeRef = useRef<(op: OperationType, args?: string) => void>(() => {});
  const [hasDiffActive, setHasDiffActive] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);

  // Check if we need to show the setup screen (Tauri only, first run)
  useEffect(() => {
    async function checkSetup() {
      if (!isTauriEnvironment()) {
        setSetupChecked(true);
        return;
      }

      const status = await checkModelsStatus();
      if (status && !status.has_llm && !status.has_whisper) {
        setShowSetup(true);
      }
      setSetupChecked(true);
    }
    checkSetup();
  }, []);

  const handleSetupComplete = useCallback(() => {
    setShowSetup(false);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
      Underline,
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
    content: '',
    editorProps: {
      attributes: {
        class: 'min-h-[60vh] outline-none prose prose-lg max-w-none',
        role: 'textbox',
        'aria-label': 'Document editor',
        'aria-multiline': 'true',
      },
    },
  });

  const {
    isReady,
    isPaused,
    isLocalMode,
    isProcessing,
    lastError,
    executeOperation,
    retryLastOperation,
    acceptDiff,
    rejectDiff,
  } = useDocumentAI({ editor });

  useGhostText({ editor, enabled: isReady });
  const voicePipeline = useVoicePipeline({ editor });
  useAutoSave({ editor });

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

  const handleAIOperation = useCallback(
    (operation: OperationType) => {
      executeOperation(operation);
    },
    [executeOperation],
  );

  // Show loading state while checking setup
  if (!setupChecked) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      </main>
    );
  }

  // Show setup screen for first-run model download
  if (showSetup) {
    return <SetupScreen onComplete={handleSetupComplete} />;
  }

  return (
    <main className="min-h-screen flex flex-col">
      <Toolbar
        editor={editor}
        onAIOperation={handleAIOperation}
        voicePipeline={voicePipeline}
        isLocalMode={isLocalMode}
      />
      <BackpressureIndicator
        isPaused={isPaused}
        isLocalMode={isLocalMode}
        isProcessing={isProcessing}
        lastError={lastError}
        onRetry={retryLastOperation}
      />
      <div className="flex-1 max-w-4xl mx-auto w-full p-4 md:p-8">
        <EditorArea
          editor={editor}
          hasDiffActive={hasDiffActive}
          onAcceptDiff={acceptDiff}
          onRejectDiff={rejectDiff}
        />
      </div>
    </main>
  );
}
