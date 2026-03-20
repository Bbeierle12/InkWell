'use client';

/**
 * useChatAI Hook
 *
 * Connects the ChatService to the chat store and editor.
 * Handles sending messages, streaming responses, applying edit
 * instructions via DiffPreview, and cleanup.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { DiffPreviewPluginKey } from '@inkwell/editor';
import { ClaudeClient, OllamaClient } from '@inkwell/document-ai';
import { ChatService, extractEditBlocks } from '../lib/chat-service';
import { useChatStore } from '../lib/chat-store';
import { useSettingsStore } from '../lib/settings-store';
import { resolveClaudeApiKey } from '../lib/ai-auth';
import type { ChatMessage, AIEditInstruction } from '@inkwell/shared';

interface UseChatAIOptions {
  editor: Editor | null;
  acceptDiff: () => void;
  rejectDiff: () => void;
}

let idCounter = 0;
function nextId(): string {
  return `chat-${Date.now()}-${++idCounter}`;
}

export function useChatAI({ editor, acceptDiff, rejectDiff }: UseChatAIOptions) {
  const serviceRef = useRef<ChatService | null>(null);
  const claudeApiKey = useSettingsStore((s) => s.claudeApiKey);
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const ollamaBaseUrl = useSettingsStore((s) => s.ollamaBaseUrl);
  const ollamaModel = useSettingsStore((s) => s.ollamaModel);

  // Rebuild service when provider or credentials change
  useEffect(() => {
    serviceRef.current?.destroy();
    serviceRef.current = null;

    if (aiProvider === 'ollama') {
      if (ollamaModel) {
        serviceRef.current = new ChatService(
          new OllamaClient({ baseUrl: ollamaBaseUrl, model: ollamaModel }),
        );
      }
    } else {
      const resolved = resolveClaudeApiKey({
        settingsApiKey: claudeApiKey,
        envApiKey: process.env.NEXT_PUBLIC_CLAUDE_API_KEY,
      });
      if (resolved) {
        serviceRef.current = new ChatService(
          new ClaudeClient({ apiKey: resolved.apiKey }),
        );
      }
    }

    return () => {
      serviceRef.current?.destroy();
      serviceRef.current = null;
    };
  }, [claudeApiKey, aiProvider, ollamaBaseUrl, ollamaModel]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!serviceRef.current || !editor) return;

      const store = useChatStore.getState();

      // Add user message
      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      };
      store.addMessage(userMsg);
      store.setStreamingContent('');
      store.setStreamStatus('streaming');
      store.setError(null);

      // Gather document context
      const docContent = editor.state.doc.textContent;
      const { from, to } = editor.state.selection;
      const selectedText =
        from !== to ? editor.state.doc.textBetween(from, to, '\n') : undefined;

      // All messages including the new user message
      const allMessages = [...store.messages, userMsg];

      const assistantId = nextId();

      await serviceRef.current.streamChat(
        allMessages,
        docContent,
        selectedText,
        {
          onDelta: (delta) => {
            useChatStore.getState().appendStreamingContent(delta);
          },
          onComplete: (displayText, editInstructions) => {
            const assistantMsg: ChatMessage = {
              id: assistantId,
              role: 'assistant',
              content: displayText,
              editInstructions:
                editInstructions.length > 0 ? editInstructions : undefined,
              editStatus:
                editInstructions.length > 0 ? 'pending' : undefined,
              timestamp: Date.now(),
            };

            const chatStore = useChatStore.getState();
            chatStore.addMessage(assistantMsg);
            chatStore.setStreamingContent('');
            chatStore.setStreamStatus('idle');

            // If there are edit instructions, show diff preview in editor
            if (editInstructions.length > 0 && editor) {
              const tr = editor.state.tr.setMeta(DiffPreviewPluginKey, {
                instructions: editInstructions,
              });
              editor.view.dispatch(tr);
            }
          },
          onError: (error) => {
            const chatStore = useChatStore.getState();
            chatStore.setStreamingContent('');
            chatStore.setStreamStatus('error');
            chatStore.setError(error);
          },
        },
      );
    },
    [editor],
  );

  const stopStreaming = useCallback(() => {
    serviceRef.current?.abort();
    const store = useChatStore.getState();
    const streamingContent = store.streamingContent;

    if (streamingContent) {
      const { displayText, editInstructions } =
        extractEditBlocks(streamingContent);
      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: displayText || streamingContent,
        editInstructions:
          editInstructions.length > 0 ? editInstructions : undefined,
        editStatus: editInstructions.length > 0 ? 'pending' : undefined,
        timestamp: Date.now(),
      };
      store.addMessage(assistantMsg);
    }

    store.setStreamingContent('');
    store.setStreamStatus('idle');
  }, []);

  const applyEdits = useCallback(
    (messageId: string) => {
      if (!editor) return;
      const store = useChatStore.getState();
      const message = store.messages.find((m) => m.id === messageId);
      if (!message?.editInstructions) return;

      // Show diff preview
      const tr = editor.state.tr.setMeta(DiffPreviewPluginKey, {
        instructions: message.editInstructions,
      });
      editor.view.dispatch(tr);

      // Accept it
      acceptDiff();
      store.markEditStatus(messageId, 'accepted');
    },
    [editor, acceptDiff],
  );

  const dismissEdits = useCallback(
    (messageId: string) => {
      if (!editor) return;
      rejectDiff();
      useChatStore.getState().markEditStatus(messageId, 'rejected');
    },
    [editor, rejectDiff],
  );

  return {
    sendMessage,
    stopStreaming,
    applyEdits,
    dismissEdits,
  };
}
