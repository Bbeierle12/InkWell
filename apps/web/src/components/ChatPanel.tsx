'use client';

/**
 * ChatPanel — "Ask InkWell" AI rail.
 *
 * Right-side panel for multi-turn AI chat about the document.
 * Header shows orb + model subtitle; composer wraps a textarea
 * with context pills and a model chip.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '@/lib/chat-store';
import { useSettingsStore } from '@/lib/settings-store';
import type { ChatMessage } from '@inkwell/shared';

interface ChatPanelProps {
  sendMessage: (text: string) => Promise<void>;
  stopStreaming: () => void;
  applyEdits: (messageId: string) => void;
  dismissEdits: (messageId: string) => void;
}

function MessageBubble({
  message,
  onApplyEdits,
  onDismissEdits,
}: {
  message: ChatMessage;
  onApplyEdits: (id: string) => void;
  onDismissEdits: (id: string) => void;
}) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`inkwell-chat-message ${
        isUser ? 'inkwell-chat-message-user' : 'inkwell-chat-message-assistant'
      }`}
    >
      {!isUser && (
        <div className="inkwell-chat-message-meta">
          <span className="inkwell-chat-message-meta-orb" />
          <span>InkWell</span>
        </div>
      )}
      <div
        className={`inkwell-chat-bubble ${
          isUser ? 'inkwell-chat-bubble-user' : 'inkwell-chat-bubble-assistant'
        }`}
      >
        {message.content}
      </div>
      {message.editInstructions && message.editInstructions.length > 0 && (
        <div className="inkwell-chat-edit-actions">
          {message.editStatus === 'pending' && (
            <>
              <button
                className="inkwell-chat-edit-apply"
                onClick={() => onApplyEdits(message.id)}
              >
                Apply Changes
              </button>
              <button
                className="inkwell-chat-edit-dismiss"
                onClick={() => onDismissEdits(message.id)}
              >
                Dismiss
              </button>
            </>
          )}
          {message.editStatus === 'accepted' && (
            <span className="inkwell-chat-edit-badge inkwell-chat-edit-badge-accepted">
              Applied
            </span>
          )}
          {message.editStatus === 'rejected' && (
            <span className="inkwell-chat-edit-badge inkwell-chat-edit-badge-rejected">
              Dismissed
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function ChatPanel({
  sendMessage,
  stopStreaming,
  applyEdits,
  dismissEdits,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { chatOpen, messages, streamingContent, streamStatus, error } = useChatStore();
  const { toggleChat, clearMessages } = useChatStore();
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const ollamaModel = useSettingsStore((s) => s.ollamaModel);
  const modelLabel = aiProvider === 'claude' ? 'Sonnet' : ollamaModel || 'Local';
  const subtitle =
    aiProvider === 'claude'
      ? 'Claude Sonnet · workspace context on'
      : `Ollama · ${ollamaModel || 'no model selected'}`;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  useEffect(() => {
    if (chatOpen) {
      textareaRef.current?.focus();
    }
  }, [chatOpen]);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streamStatus === 'streaming') return;
    setInput('');
    await sendMessage(trimmed);
  }, [input, streamStatus, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!chatOpen) return null;

  return (
    <aside className="inkwell-chat-panel" aria-label="AI Chat">
      <div className="inkwell-chat-header">
        <div className="inkwell-chat-header-info">
          <span className="inkwell-chat-title">
            <span className="inkwell-chat-title-orb" />
            Ask InkWell
          </span>
          <span className="inkwell-chat-subtitle">{subtitle}</span>
        </div>
        <div className="inkwell-chat-header-actions">
          <button
            className="inkwell-chat-header-btn"
            onClick={clearMessages}
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 4h12M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5M3 4l1 9a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-9" />
            </svg>
          </button>
          <button
            className="inkwell-chat-header-btn"
            onClick={toggleChat}
            title="Close chat"
            aria-label="Close chat"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      <div className="inkwell-chat-messages">
        {messages.length === 0 && !streamingContent && (
          <div className="inkwell-chat-empty">
            Ask InkWell about your document, or request edits.
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onApplyEdits={applyEdits}
            onDismissEdits={dismissEdits}
          />
        ))}
        {streamingContent && (
          <div className="inkwell-chat-message inkwell-chat-message-assistant">
            <div className="inkwell-chat-message-meta">
              <span className="inkwell-chat-message-meta-orb" />
              <span>InkWell · streaming</span>
            </div>
            <div className="inkwell-chat-bubble inkwell-chat-bubble-assistant">
              {streamingContent}
              <span className="inkwell-chat-cursor" />
            </div>
          </div>
        )}
        {error && <div className="inkwell-chat-error">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="inkwell-chat-input-area">
        <div className="inkwell-chat-input-box">
          <textarea
            ref={textareaRef}
            className="inkwell-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask InkWell, or press / for commands…"
            rows={2}
            disabled={streamStatus === 'streaming'}
          />
          <div className="inkwell-chat-input-row">
            <span className="inkwell-chat-input-model">
              <span className="led" />
              {modelLabel}
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>⌘⇧L</span>
            {streamStatus === 'streaming' ? (
              <button
                className="inkwell-chat-stop-btn"
                onClick={stopStreaming}
                aria-label="Stop streaming"
              >
                Stop
              </button>
            ) : (
              <button
                className="inkwell-chat-send-btn"
                onClick={handleSend}
                disabled={!input.trim()}
                aria-label="Send message"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 10l14-7-5 17-3-7z" />
                </svg>
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
