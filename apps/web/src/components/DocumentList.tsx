'use client';

/**
 * DocumentList Component
 *
 * Renders the list of saved documents inside the sidebar.
 * Each item shows title, relative timestamp, and content preview.
 */

import { useEffect } from 'react';
import type { StoredDocument } from '@/lib/document-store';
import { DocumentListItem } from './DocumentListItem';

interface DocumentListProps {
  documents: StoredDocument[];
  activeDocumentId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRestore?: (id: string) => void;
  onRefresh: () => Promise<void>;
  isTrashView?: boolean;
}

export function DocumentList({
  documents,
  activeDocumentId,
  onSelect,
  onDelete,
  onRestore,
  onRefresh,
  isTrashView = false,
}: DocumentListProps) {
  // Load document list on mount
  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  if (documents.length === 0) {
    return (
      <div className="inkwell-sidebar-empty" role="status">
        <p className="text-sm text-gray-500">
          {isTrashView ? 'Trash is empty' : 'No documents yet'}
        </p>
        {!isTrashView && (
          <p className="text-xs text-gray-400">Create a new document to get started</p>
        )}
      </div>
    );
  }

  return (
    <div className="inkwell-document-list" role="list" aria-label="Document list">
      {documents.map((doc) => (
        <DocumentListItem
          key={doc.id}
          document={doc}
          isActive={doc.id === activeDocumentId}
          onSelect={() => onSelect(doc.id)}
          onDelete={() => onDelete(doc.id)}
          onRestore={onRestore ? () => onRestore(doc.id) : undefined}
          isTrashView={isTrashView}
        />
      ))}
    </div>
  );
}
