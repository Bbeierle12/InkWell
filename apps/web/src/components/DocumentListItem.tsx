'use client';

/**
 * DocumentListItem Component
 *
 * Individual document list item with title, relative time, preview,
 * pin indicator, tags, and context menu (delete/restore).
 */

import { useState, useCallback } from 'react';
import type { StoredDocument } from '@/lib/document-store';
import { useDocumentStore } from '@/lib/document-store';
import { extractPreview, formatRelativeTime, tagColor } from '@/lib/document-utils';

interface DocumentListItemProps {
  document: StoredDocument;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRestore?: () => void;
  isTrashView?: boolean;
}

export function DocumentListItem({
  document,
  isActive,
  onSelect,
  onDelete,
  onRestore,
  isTrashView = false,
}: DocumentListItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { togglePin } = useDocumentStore();

  const preview = extractPreview(document.content, 80);
  const timeAgo = formatRelativeTime(document.updatedAt);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(true);
  }, []);

  const handleMenuToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu((s) => !s);
  }, []);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isTrashView && !confirmDelete) {
        setConfirmDelete(true);
        return;
      }
      onDelete();
      setShowMenu(false);
      setConfirmDelete(false);
    },
    [confirmDelete, onDelete, isTrashView],
  );

  const handleRestore = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRestore?.();
      setShowMenu(false);
    },
    [onRestore],
  );

  const handlePin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      togglePin(document.id);
      setShowMenu(false);
    },
    [document.id, togglePin],
  );

  const handleCancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
    setShowMenu(false);
  }, []);

  return (
    <div
      className={`inkwell-doc-item ${isActive ? 'inkwell-doc-item-active' : ''}`}
      role="listitem"
      onClick={isTrashView ? undefined : onSelect}
      onContextMenu={handleContextMenu}
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isTrashView) {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-current={isActive ? 'true' : undefined}
      aria-label={`${document.title}, ${timeAgo}`}
    >
      <div className="inkwell-doc-item-header">
        <span className="inkwell-doc-item-title">
          {document.pinned && <span className="inkwell-pin-icon" title="Pinned">&#9733; </span>}
          {document.title}
        </span>
        <button
          className="inkwell-doc-item-menu-btn"
          onClick={handleMenuToggle}
          aria-label="Document options"
          aria-expanded={showMenu}
          title="Options"
        >
          &#x22EE;
        </button>
      </div>
      <div className="inkwell-doc-item-meta">
        <span className="inkwell-doc-item-time">{timeAgo}</span>
        {document.wordCount > 0 && (
          <span className="inkwell-doc-item-wc">{document.wordCount}w</span>
        )}
      </div>
      {document.tags.length > 0 && (
        <div className="inkwell-doc-item-tags">
          {document.tags.map((tag) => (
            <span
              key={tag}
              className="inkwell-doc-item-tag"
              style={{ '--tag-color': tagColor(tag) } as React.CSSProperties}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {preview && <p className="inkwell-doc-item-preview">{preview}</p>}

      {showMenu && (
        <div className="inkwell-doc-item-context-menu" role="menu">
          {isTrashView ? (
            <>
              {onRestore && (
                <button
                  className="inkwell-doc-item-menu-action"
                  role="menuitem"
                  onClick={handleRestore}
                >
                  Restore
                </button>
              )}
              <button
                className="inkwell-doc-item-menu-action inkwell-doc-item-menu-danger"
                role="menuitem"
                onClick={handleDelete}
              >
                Delete Forever
              </button>
            </>
          ) : confirmDelete ? (
            <>
              <span className="inkwell-doc-item-confirm-text">Move to trash?</span>
              <button
                className="inkwell-doc-item-menu-action inkwell-doc-item-menu-danger"
                role="menuitem"
                onClick={handleDelete}
              >
                Confirm
              </button>
              <button
                className="inkwell-doc-item-menu-action"
                role="menuitem"
                onClick={handleCancelDelete}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="inkwell-doc-item-menu-action"
                role="menuitem"
                onClick={handlePin}
              >
                {document.pinned ? 'Unpin' : 'Pin'}
              </button>
              <button
                className="inkwell-doc-item-menu-action inkwell-doc-item-menu-danger"
                role="menuitem"
                onClick={handleDelete}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
