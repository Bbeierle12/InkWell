'use client';

/**
 * Sidebar Component
 *
 * Workspace sidebar with header, search, tag filter, sort,
 * pinned + recent document list, and footer (trash + settings).
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
  const {
    sidebarOpen,
    documentId,
    refreshDocuments,
    load,
    softDelete,
    restore,
    permanentDelete,
    newDocument,
    showTrash,
    documents,
  } = store;
  const filteredDocuments = getFilteredDocuments(store);

  if (!sidebarOpen) return null;

  const handleNewDocument = async () => {
    if (!editor) return;
    await newDocument(editor);
  };

  const handleLoadDocument = async (id: string) => {
    if (!editor) return;
    if (id === documentId) return;
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
    if (wasActiveDoc && editor) {
      editor.commands.clearContent();
    }
  };

  const handleRestoreDocument = async (id: string) => {
    await restore(id);
  };

  const activeDocs = documents.filter((d) => d.deletedAt === null);

  return (
    <aside className="inkwell-sidebar" role="complementary" aria-label="Document sidebar">
      <div className="inkwell-sidebar-header">
        <span>{showTrash ? 'Trash' : 'Workspace'}</span>
        {!showTrash && (
          <span className="inkwell-sidebar-header-count">{activeDocs.length}</span>
        )}
      </div>

      {!showTrash && <SearchBar />}

      {!showTrash && (
        <div style={{ padding: '0 10px 10px' }}>
          <button
            type="button"
            className="inkwell-sidebar-new-btn"
            onClick={handleNewDocument}
            disabled={!editor}
            aria-label="New document"
            title="New document"
            style={{
              width: '100%',
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '0 10px',
              fontSize: 12,
              fontWeight: 500,
              background: 'var(--ink)',
              color: 'var(--page)',
              borderColor: 'var(--ink)',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="M10 4v12M4 10h12" />
            </svg>
            New document
          </button>
        </div>
      )}

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
            <svg
              width="13"
              height="13"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="10" cy="10" r="2.5" />
              <path d="M10 2v3M10 15v3M2 10h3M15 10h3M4 4l2 2M14 14l2 2M4 16l2-2M14 6l2-2" />
            </svg>
            Settings
          </button>
        )}
      </div>
    </aside>
  );
}
