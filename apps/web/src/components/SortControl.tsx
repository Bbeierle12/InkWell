'use client';

/**
 * SortControl Component
 *
 * Dropdown to control document list ordering.
 */

import { useDocumentStore, type SortMode } from '@/lib/document-store';

export function SortControl() {
  const { sortMode, setSortMode } = useDocumentStore();

  return (
    <select
      className="inkwell-sort-control"
      value={sortMode}
      onChange={(e) => setSortMode(e.target.value as SortMode)}
      aria-label="Sort documents"
    >
      <option value="updated">Last Modified</option>
      <option value="created">Created</option>
      <option value="title-az">Title A-Z</option>
      <option value="title-za">Title Z-A</option>
    </select>
  );
}
