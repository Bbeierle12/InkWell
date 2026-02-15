'use client';

/**
 * DocumentTitle Component
 *
 * Editable document title displayed in the toolbar.
 * Reads and writes via useDocumentStore.
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import { useDocumentStore } from '@/lib/document-store';

export function DocumentTitle() {
  const { title, setTitle } = useDocumentStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync editValue when title changes externally (e.g., loading a document)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(title);
    }
  }, [title, isEditing]);

  const startEditing = useCallback(() => {
    setIsEditing(true);
    setEditValue(title);
    // Focus the input on next render
    setTimeout(() => inputRef.current?.select(), 0);
  }, [title]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) {
      setTitle(trimmed);
    } else {
      setEditValue(title); // Reset to original if empty
    }
  }, [editValue, title, setTitle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
        setEditValue(title);
      }
    },
    [commitEdit, title],
  );

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="inkwell-doc-title-input"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
        aria-label="Document title"
        autoFocus
      />
    );
  }

  return (
    <button
      className="inkwell-doc-title"
      onClick={startEditing}
      title="Click to rename"
      aria-label={`Document title: ${title}. Click to rename.`}
    >
      {title}
    </button>
  );
}
