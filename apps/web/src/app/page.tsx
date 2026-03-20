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
import { Sidebar } from '@/components/Sidebar';
import { ChatPanel } from '@/components/ChatPanel';
import { BackpressureIndicator } from '@/components/BackpressureIndicator';
import { EditorArea } from '@/components/EditorArea';
import { StatusBar } from '@/components/StatusBar';
import { SetupScreen } from '@/components/SetupScreen';
import { SettingsModal } from '@/components/SettingsModal';
import { useDocumentAI } from '@/hooks/useDocumentAI';
import { useChatAI } from '@/hooks/useChatAI';
import { useGhostText } from '@/hooks/useGhostText';
import { useVoicePipeline } from '@/hooks/useVoicePipeline';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useFileOpen } from '@/hooks/useFileOpen';
import { TagInput } from '@/components/TagInput';
import { useDocumentStore } from '@/lib/document-store';
import { useChatStore } from '@/lib/chat-store';
import { useSettingsStore, FONT_FAMILY_MAP, FONT_SIZE_MAP, EDITOR_WIDTH_MAP } from '@/lib/settings-store';
import { deriveTitleFromContent } from '@/lib/document-utils';
import { isTauriEnvironment, checkModelsStatus } from '@/lib/tauri-bridge';
import {
  loadClaudeApiKeyFromSecureStorage,
  migrateLegacyClaudeApiKeyFromLocalStorage,
} from '@/lib/claude-key-storage';

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { title, setTitle, toggleSidebar, documentId, documents } = useDocumentStore();
  const setClaudeApiKey = useSettingsStore((s) => s.setClaudeApiKey);
  const {
    editorFontFamily,
    editorFontSize,
    editorWidth,
    spellCheck,
    ghostTextEnabled,
  } = useSettingsStore();

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

  useEffect(() => {
    let cancelled = false;

    async function hydrateClaudeKey() {
      await migrateLegacyClaudeApiKeyFromLocalStorage();
      const secureKey = await loadClaudeApiKeyFromSecureStorage();
      if (!cancelled && secureKey) {
        setClaudeApiKey(secureKey);
      }
    }

    void hydrateClaudeKey();
    return () => {
      cancelled = true;
    };
  }, [setClaudeApiKey]);

  const handleSetupComplete = useCallback(() => {
    setShowSetup(false);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
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
        spellcheck: spellCheck ? 'true' : 'false',
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

  const { sendMessage, stopStreaming, applyEdits, dismissEdits } = useChatAI({
    editor,
    acceptDiff,
    rejectDiff,
  });
  const toggleChat = useChatStore((s) => s.toggleChat);

  useGhostText({ editor, enabled: isReady && ghostTextEnabled });
  const voicePipeline = useVoicePipeline({ editor });
  useAutoSave({ editor });
  useFileOpen({ editor });

  // Update spellcheck attribute when setting changes
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({
      editorProps: {
        attributes: {
          class: 'min-h-[60vh] outline-none prose prose-lg max-w-none',
          role: 'textbox',
          'aria-label': 'Document editor',
          'aria-multiline': 'true',
          spellcheck: spellCheck ? 'true' : 'false',
        },
      },
    });
  }, [editor, spellCheck]);

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

  // Auto-title: derive title from content when still "Untitled"
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      if (title !== 'Untitled') return;
      const content = editor.getJSON() as Record<string, unknown>;
      const derived = deriveTitleFromContent(content);
      if (derived) {
        setTitle(derived);
      }
    };

    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor, title, setTitle]);

  const handleAIOperation = useCallback(
    (operation: OperationType) => {
      executeOperation(operation);
    },
    [executeOperation],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        toggleChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar, toggleChat]);

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
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleChat={toggleChat}
      />
      <BackpressureIndicator
        isPaused={isPaused}
        isLocalMode={isLocalMode}
        isProcessing={isProcessing}
        lastError={lastError}
        onRetry={retryLastOperation}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar editor={editor} onOpenSettings={() => setSettingsOpen(true)} />
        <div className="flex-1 flex flex-col min-w-0">
          <div
            className="flex-1 mx-auto w-full p-4 md:p-8"
            style={{
              maxWidth: EDITOR_WIDTH_MAP[editorWidth],
              fontFamily: FONT_FAMILY_MAP[editorFontFamily],
              fontSize: FONT_SIZE_MAP[editorFontSize],
            }}
          >
            <EditorArea
              editor={editor}
              hasDiffActive={hasDiffActive}
              onAcceptDiff={acceptDiff}
              onRejectDiff={rejectDiff}
            />
            {documentId && (
              <TagInput
                documentId={documentId}
                tags={documents.find((d) => d.id === documentId)?.tags ?? []}
              />
            )}
          </div>
          <StatusBar editor={editor} />
        </div>
        <ChatPanel
          sendMessage={sendMessage}
          stopStreaming={stopStreaming}
          applyEdits={applyEdits}
          dismissEdits={dismissEdits}
        />
      </div>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}
