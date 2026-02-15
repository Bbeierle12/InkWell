'use client';

/**
 * EditorArea Component
 *
 * Presentational component that renders the TipTap editor content
 * and conditional diff accept/reject buttons.
 */
import type { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';

interface EditorAreaProps {
  editor: Editor | null;
  hasDiffActive: boolean;
  onAcceptDiff: () => void;
  onRejectDiff: () => void;
}

export function EditorArea({ editor, hasDiffActive, onAcceptDiff, onRejectDiff }: EditorAreaProps) {
  return (
    <div className="prose prose-lg max-w-none">
      <div data-testid="inkwell-editor">
        <EditorContent editor={editor} />
      </div>
      {editor && hasDiffActive && (
        <div className="inkwell-diff-actions mt-2 flex gap-2" role="toolbar" aria-label="Diff actions">
          <button
            onClick={onAcceptDiff}
            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
            aria-label="Accept AI changes"
          >
            Accept
          </button>
          <button
            onClick={onRejectDiff}
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
