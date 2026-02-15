'use client';

/**
 * Toolbar Component
 *
 * Editor toolbar with sidebar toggle, document title, formatting controls,
 * heading selector, list buttons, AI operations dropdown, export menu,
 * voice input, and mode indicator.
 */

import { useState, useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { OperationType } from '@inkwell/shared';
import { VoiceInput } from './VoiceInput';
import { DocumentTitle } from './DocumentTitle';
import { ExportMenu } from './ExportMenu';
import { useDocumentStore } from '@/lib/document-store';
import type { UseVoicePipelineReturn } from '../hooks/useVoicePipeline';

interface ToolbarProps {
  editor: Editor | null;
  onAIOperation: (operation: OperationType) => void;
  voicePipeline: UseVoicePipelineReturn;
  isLocalMode: boolean;
}

export function Toolbar({ editor, onAIOperation, voicePipeline, isLocalMode }: ToolbarProps) {
  const [, setTick] = useState(0);
  const [aiDropdownOpen, setAiDropdownOpen] = useState(false);
  const { toggleSidebar, sidebarOpen } = useDocumentStore();

  // Force re-render on editor transactions so active states update
  useEffect(() => {
    if (!editor) return;
    const handler = () => setTick((t) => t + 1);
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  const toggleAiDropdown = useCallback(() => {
    setAiDropdownOpen((o) => !o);
  }, []);

  const handleAiOperation = useCallback(
    (op: OperationType) => {
      onAIOperation(op);
      setAiDropdownOpen(false);
    },
    [onAIOperation],
  );

  const currentHeading = editor
    ? editor.isActive('heading', { level: 1 })
      ? '1'
      : editor.isActive('heading', { level: 2 })
        ? '2'
        : editor.isActive('heading', { level: 3 })
          ? '3'
          : '0'
    : '0';

  const handleHeadingChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (!editor) return;
      const level = parseInt(e.target.value, 10);
      if (level === 0) {
        editor.chain().focus().setParagraph().run();
      } else {
        editor
          .chain()
          .focus()
          .toggleHeading({ level: level as 1 | 2 | 3 })
          .run();
      }
    },
    [editor],
  );

  return (
    <header
      className="border-b px-4 py-2 flex items-center gap-1 sticky top-0 z-10"
      style={{ backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
      role="toolbar"
      aria-label="Editor toolbar"
    >
      {/* Sidebar toggle */}
      <button
        className="inkwell-toolbar-btn"
        onClick={toggleSidebar}
        aria-pressed={sidebarOpen}
        aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        title="Toggle sidebar (Ctrl+\\)"
      >
        &#9776;
      </button>

      <div className="inkwell-toolbar-sep" />

      {/* Document title */}
      <DocumentTitle />

      <div className="inkwell-toolbar-sep" />

      {/* Group 1: Formatting */}
      <button
        className="inkwell-toolbar-btn"
        aria-pressed={editor?.isActive('bold') ?? false}
        onClick={() => editor?.chain().focus().toggleBold().run()}
        disabled={!editor}
        title="Bold (Ctrl+B)"
        aria-label="Bold"
      >
        <strong>B</strong>
      </button>
      <button
        className="inkwell-toolbar-btn"
        aria-pressed={editor?.isActive('italic') ?? false}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        disabled={!editor}
        title="Italic (Ctrl+I)"
        aria-label="Italic"
      >
        <em>I</em>
      </button>
      <button
        className="inkwell-toolbar-btn"
        aria-pressed={editor?.isActive('underline') ?? false}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
        disabled={!editor}
        title="Underline (Ctrl+U)"
        aria-label="Underline"
      >
        <span style={{ textDecoration: 'underline' }}>U</span>
      </button>
      <button
        className="inkwell-toolbar-btn"
        aria-pressed={editor?.isActive('strike') ?? false}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
        disabled={!editor}
        title="Strikethrough"
        aria-label="Strikethrough"
      >
        <s>S</s>
      </button>
      <button
        className="inkwell-toolbar-btn"
        aria-pressed={editor?.isActive('code') ?? false}
        onClick={() => editor?.chain().focus().toggleCode().run()}
        disabled={!editor}
        title="Inline code"
        aria-label="Code"
      >
        {'</>'}
      </button>

      <div className="inkwell-toolbar-sep" />

      {/* Group 2: Heading selector */}
      <select
        className="inkwell-toolbar-btn text-sm"
        value={currentHeading}
        onChange={handleHeadingChange}
        disabled={!editor}
        aria-label="Heading level"
      >
        <option value="0">Paragraph</option>
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
      </select>

      <div className="inkwell-toolbar-sep" />

      {/* Group 3: Lists */}
      <button
        className="inkwell-toolbar-btn"
        aria-pressed={editor?.isActive('bulletList') ?? false}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        disabled={!editor}
        title="Bullet list"
        aria-label="Bullet list"
      >
        UL
      </button>
      <button
        className="inkwell-toolbar-btn"
        aria-pressed={editor?.isActive('orderedList') ?? false}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        disabled={!editor}
        title="Numbered list"
        aria-label="Ordered list"
      >
        OL
      </button>

      <div className="inkwell-toolbar-sep" />

      {/* Group 4: AI Operations dropdown */}
      <div className="relative">
        <button
          className="inkwell-toolbar-btn"
          onClick={toggleAiDropdown}
          disabled={!editor}
          aria-expanded={aiDropdownOpen}
          aria-haspopup="true"
          aria-label="AI operations"
        >
          AI
        </button>
        {aiDropdownOpen && (
          <div className="inkwell-dropdown" role="menu" aria-label="AI operations menu">
            <button
              className="inkwell-dropdown-item"
              role="menuitem"
              onClick={() => handleAiOperation(OperationType.Rewrite)}
            >
              Rewrite
            </button>
            <button
              className="inkwell-dropdown-item"
              role="menuitem"
              onClick={() => handleAiOperation(OperationType.Summarize)}
            >
              Summarize
            </button>
            <button
              className="inkwell-dropdown-item"
              role="menuitem"
              onClick={() => handleAiOperation(OperationType.Expand)}
            >
              Expand
            </button>
            <button
              className="inkwell-dropdown-item"
              role="menuitem"
              onClick={() => handleAiOperation(OperationType.Critique)}
            >
              Critique
            </button>
          </div>
        )}
      </div>

      <div className="inkwell-toolbar-sep" />

      {/* Group 5: Export */}
      <ExportMenu editor={editor} />

      <div className="inkwell-toolbar-sep" />

      {/* Group 6: Voice input */}
      <VoiceInput pipeline={voicePipeline} />

      {/* Right-aligned section */}
      <div className="flex-1" />

      {/* Mode indicator */}
      <span
        className="inkwell-mode-chip"
        role="status"
        aria-label={isLocalMode ? 'Offline mode' : 'Online mode'}
      >
        <span
          className="inline-block w-2 h-2 rounded-full mr-1"
          style={{ backgroundColor: isLocalMode ? '#f59e0b' : '#22c55e' }}
        />
        {isLocalMode ? 'Offline' : 'Online'}
      </span>
    </header>
  );
}
