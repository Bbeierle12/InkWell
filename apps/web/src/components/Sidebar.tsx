'use client';

/**
 * Sidebar Component
 *
 * Collapsible sidebar shell containing search, tag filter,
 * document list, sort control, and trash toggle.
 */

import type { Editor } from '@tiptap/core';
import { DocumentList } from './DocumentList';
import { SearchBar } from './SearchBar';
import { TagFilter } from './TagFilter';
import { SortControl } from './SortControl';
import { TrashToggle } from './TrashView';
import { useDocumentStore, getFilteredDocuments } from '@/lib/document-store';

interface SidebarProps {
  editor: Editor | null;
  onOpenSettings?: () => void;
}

export function Sidebar({ editor, onOpenSettings }: SidebarProps) {
  const store = useDocumentStore();
  const { sidebarOpen, documentId, refreshDocuments, load, softDelete, restore, permanentDelete, newDocument, showTrash } = store;
  const filteredDocuments = getFilteredDocuments(store);

  if (!sidebarOpen) return null;

  const handleNewDocument = async () => {
    if (!editor) return;
    await newDocument(editor);
  };

  const handleLoadDocument = async (id: string) => {
    if (!editor) return;
    // Don't reload the document we're already viewing
    if (id === documentId) return;
    // Save current document before switching if it has unsaved changes
    if (store.isDirty) {
      await store.save(editor);
    }
    await load(id, editor);
  };

  const handleDeleteDocument = async (id: string) => {
    const wasActiveDoc = id === documentId;
    if (showTrash) {
      await permanentDelete(id);
    } else {
      await softDelete(id);
    }
    // Clear editor content when deleting the active document
    // to prevent auto-save from recreating it
    if (wasActiveDoc && editor) {
      editor.commands.clearContent();
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
        {onOpenSettings && (
          <button
            type="button"
            className="inkwell-sidebar-settings-btn"
            onClick={onOpenSettings}
          >
            Settings
          </button>
        )}
      </div>
    </aside>
  );
}
