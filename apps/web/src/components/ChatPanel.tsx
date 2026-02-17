'use client';

/**
 * ChatPanel Component
 *
 * Right-side panel for multi-turn AI chat about the document.
 * Shows conversation messages, streaming responses, and edit actions.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '@/lib/chat-store';
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
      className={`inkwell-chat-message ${isUser ? 'inkwell-chat-message-user' : 'inkwell-chat-message-assistant'}`}
    >
      <div
        className={`inkwell-chat-bubble ${isUser ? 'inkwell-chat-bubble-user' : 'inkwell-chat-bubble-assistant'}`}
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

  const { chatOpen, messages, streamingContent, streamStatus, error } =
    useChatStore();
  const { toggleChat, clearMessages } = useChatStore();

  // Auto-scroll to bottom on new messages or streaming content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus textarea when panel opens
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
      {/* Header */}
      <div className="inkwell-chat-header">
        <span className="inkwell-chat-title">AI Chat</span>
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

      {/* Messages */}
      <div className="inkwell-chat-messages">
        {messages.length === 0 && !streamingContent && (
          <div className="inkwell-chat-empty">
            Ask me anything about your document, or request edits.
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
            <div className="inkwell-chat-bubble inkwell-chat-bubble-assistant">
              {streamingContent}
              <span className="inkwell-chat-cursor" />
            </div>
          </div>
        )}
        {error && (
          <div className="inkwell-chat-error">{error}</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="inkwell-chat-input-area">
        <textarea
          ref={textareaRef}
          className="inkwell-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your document..."
          rows={2}
          disabled={streamStatus === 'streaming'}
        />
        <div className="inkwell-chat-input-actions">
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
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M1.5 1.5l13 6.5-13 6.5V9l8-1-8-1V1.5z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
