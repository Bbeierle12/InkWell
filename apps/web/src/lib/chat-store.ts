/**
 * Chat Store — Zustand store for AI chat sidebar state.
 *
 * Session-only (no persistence). Manages chat open/close state,
 * conversation messages, streaming content, and error state.
 */

import { create } from 'zustand';
import type { ChatMessage, ChatStreamStatus } from '@inkwell/shared';

interface ChatState {
  chatOpen: boolean;
  messages: ChatMessage[];
  streamingContent: string;
  streamStatus: ChatStreamStatus;
  error: string | null;

  toggleChat: () => void;
  setChatOpen: (open: boolean) => void;
  addMessage: (message: ChatMessage) => void;
  appendStreamingContent: (delta: string) => void;
  setStreamingContent: (content: string) => void;
  setStreamStatus: (status: ChatStreamStatus) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  markEditStatus: (messageId: string, status: 'accepted' | 'rejected') => void;
}

export const useChatStore = create<ChatState>()((set) => ({
  chatOpen: false,
  messages: [],
  streamingContent: '',
  streamStatus: 'idle',
  error: null,

  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  setChatOpen: (chatOpen) => set({ chatOpen }),
  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),
  appendStreamingContent: (delta) =>
    set((s) => ({ streamingContent: s.streamingContent + delta })),
  setStreamingContent: (streamingContent) => set({ streamingContent }),
  setStreamStatus: (streamStatus) => set({ streamStatus }),
  setError: (error) => set({ error }),
  clearMessages: () => set({ messages: [], error: null }),
  markEditStatus: (messageId, status) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, editStatus: status } : m,
      ),
    })),
}));
