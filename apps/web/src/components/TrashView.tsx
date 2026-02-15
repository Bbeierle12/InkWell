'use client';

/**
 * TrashView Component
 *
 * Toggle between active documents and trash.
 * Shows restore/permanent delete options for trashed documents.
 */

import { useDocumentStore } from '@/lib/document-store';

export function TrashToggle() {
  const { showTrash, setShowTrash } = useDocumentStore();

  return (
    <button
      className={`inkwell-trash-toggle ${showTrash ? 'inkwell-trash-toggle-active' : ''}`}
      onClick={() => setShowTrash(!showTrash)}
      aria-pressed={showTrash}
      aria-label={showTrash ? 'Show active documents' : 'Show trash'}
    >
      {showTrash ? 'Back to Documents' : 'Trash'}
    </button>
  );
}
