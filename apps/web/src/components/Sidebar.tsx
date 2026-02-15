'use client';

/**
 * Sidebar Component
 *
 * Collapsible sidebar shell containing search, tag filter,
 * document list, sort control, and trash toggle.
 */

import { useCallback } from 'react';
import type { Editor } from '@tiptap/core';
import { DocumentList } from './DocumentList';
import { SearchBar } from './SearchBar';
import { TagFilter } from './TagFilter';
import { SortControl } from './SortControl';
import { TrashToggle } from './TrashView';
import { useDocumentStore, getFilteredDocuments } from '@/lib/document-store';

interface SidebarProps {
  editor: Editor | null;
}

export function Sidebar({ editor }: SidebarProps) {
  const store = useDocumentStore();
  const { sidebarOpen, documentId, refreshDocuments, load, softDelete, restore, permanentDelete, newDocument, showTrash } = store;
  const filteredDocuments = getFilteredDocuments(store);

  if (!sidebarOpen) return null;

  const handleNewDocument = () => {
    if (!editor) return;
    newDocument(editor);
  };

  const handleLoadDocument = async (id: string) => {
    if (!editor) return;
    await load(id, editor);
  };

  const handleDeleteDocument = async (id: string) => {
    if (showTrash) {
      await permanentDelete(id);
    } else {
      await softDelete(id);
    }
  };

  const handleRestoreDocument = async (id: string) => {
    await restore(id);
  };

  return (
    <aside
      className="inkwell-sidebar"
      role="complementary"
      aria-label="Document sidebar"
    >
      <div className="inkwell-sidebar-header">
        <span className="text-sm font-medium">
          {showTrash ? 'Trash' : 'Documents'}
        </span>
        {!showTrash && (
          <button
            className="inkwell-sidebar-new-btn"
            onClick={handleNewDocument}
            disabled={!editor}
            aria-label="New document"
            title="New document"
          >
            +
          </button>
        )}
      </div>

      {!showTrash && <SearchBar />}
      {!showTrash && <TagFilter />}

      <div className="inkwell-sidebar-controls">
        <SortControl />
      </div>

      <DocumentList
        documents={filteredDocuments}
        activeDocumentId={documentId}
        onSelect={handleLoadDocument}
        onDelete={handleDeleteDocument}
        onRestore={showTrash ? handleRestoreDocument : undefined}
        onRefresh={refreshDocuments}
        isTrashView={showTrash}
      />

      <div className="inkwell-sidebar-footer">
        <TrashToggle />
      </div>
    </aside>
  );
}
