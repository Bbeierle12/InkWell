/**
 * Filtered Documents Selector Tests
 *
 * Tests the getFilteredDocuments() selector which combines
 * trash filtering, search, tag filtering, and sorting.
 */
import { describe, it, expect } from 'vitest';
import { getFilteredDocuments, type StoredDocument, type SortMode } from '../document-store';

function makeDoc(overrides: Partial<StoredDocument> & { id: string }): StoredDocument {
  return {
    title: 'Test',
    content: {},
    createdAt: 1000,
    updatedAt: 2000,
    tags: [],
    pinned: false,
    deletedAt: null,
    wordCount: 0,
    ...overrides,
  };
}

function makeState(overrides: {
  documents?: StoredDocument[];
  showTrash?: boolean;
  searchQuery?: string;
  activeTagFilters?: string[];
  sortMode?: SortMode;
}) {
  return {
    documentId: null,
    title: 'Untitled',
    isDirty: false,
    lastSavedAt: null,
    documents: [],
    sidebarOpen: true,
    sortMode: 'updated' as SortMode,
    searchQuery: '',
    activeTagFilters: [] as string[],
    showTrash: false,
    // Stub out actions (not needed for the selector)
    markDirty: () => {},
    markClean: () => {},
    setTitle: () => {},
    openExternalDocument: () => {},
    setSidebarOpen: () => {},
    toggleSidebar: () => {},
    setSortMode: () => {},
    setSearchQuery: () => {},
    setActiveTagFilters: () => {},
    setShowTrash: () => {},
    save: async () => {},
    load: async () => {},
    listDocuments: async () => [],
    refreshDocuments: async () => {},
    deleteDocument: async () => {},
    softDelete: async () => {},
    restore: async () => {},
    permanentDelete: async () => {},
    newDocument: async () => {},
    setTags: async () => {},
    togglePin: async () => {},
    getAllTags: () => [],
    ...overrides,
  };
}

describe('getFilteredDocuments', () => {
  it('returns active documents by default (excludes trash)', () => {
    const state = makeState({
      documents: [
        makeDoc({ id: 'a', deletedAt: null }),
        makeDoc({ id: 'b', deletedAt: 5000 }),
        makeDoc({ id: 'c', deletedAt: null }),
      ],
    });

    const result = getFilteredDocuments(state);
    expect(result.length).toBe(2);
    expect(result.map((d) => d.id)).toContain('a');
    expect(result.map((d) => d.id)).toContain('c');
  });

  it('returns trash when showTrash is true', () => {
    const state = makeState({
      showTrash: true,
      documents: [
        makeDoc({ id: 'a', deletedAt: null }),
        makeDoc({ id: 'b', deletedAt: 5000 }),
        makeDoc({ id: 'c', deletedAt: 3000 }),
      ],
    });

    const result = getFilteredDocuments(state);
    expect(result.length).toBe(2);
    expect(result.map((d) => d.id)).toEqual(expect.arrayContaining(['b', 'c']));
  });

  it('filters by search query (case insensitive)', () => {
    const state = makeState({
      searchQuery: 'blog',
      documents: [
        makeDoc({ id: 'a', title: 'Blog Post' }),
        makeDoc({ id: 'b', title: 'Meeting Notes' }),
        makeDoc({ id: 'c', title: 'My Blog Draft' }),
      ],
    });

    const result = getFilteredDocuments(state);
    expect(result.length).toBe(2);
    expect(result.map((d) => d.id)).toEqual(expect.arrayContaining(['a', 'c']));
  });

  it('ignores whitespace-only search query', () => {
    const state = makeState({
      searchQuery: '   ',
      documents: [
        makeDoc({ id: 'a', title: 'One' }),
        makeDoc({ id: 'b', title: 'Two' }),
      ],
    });

    const result = getFilteredDocuments(state);
    expect(result.length).toBe(2);
  });

  it('filters by single tag', () => {
    const state = makeState({
      activeTagFilters: ['draft'],
      documents: [
        makeDoc({ id: 'a', tags: ['draft', 'blog'] }),
        makeDoc({ id: 'b', tags: ['published'] }),
        makeDoc({ id: 'c', tags: ['draft'] }),
      ],
    });

    const result = getFilteredDocuments(state);
    expect(result.length).toBe(2);
    expect(result.map((d) => d.id)).toEqual(expect.arrayContaining(['a', 'c']));
  });

  it('filters by multiple tags (AND)', () => {
    const state = makeState({
      activeTagFilters: ['draft', 'blog'],
      documents: [
        makeDoc({ id: 'a', tags: ['draft', 'blog'] }),
        makeDoc({ id: 'b', tags: ['blog', 'published'] }),
        makeDoc({ id: 'c', tags: ['draft'] }),
      ],
    });

    const result = getFilteredDocuments(state);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('a');
  });

  it('sorts pinned first, then by updatedAt', () => {
    const state = makeState({
      sortMode: 'updated',
      documents: [
        makeDoc({ id: 'a', pinned: false, updatedAt: 5000 }),
        makeDoc({ id: 'b', pinned: true, updatedAt: 1000 }),
        makeDoc({ id: 'c', pinned: false, updatedAt: 3000 }),
      ],
    });

    const result = getFilteredDocuments(state);
    expect(result.map((d) => d.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by title A-Z with pin priority', () => {
    const state = makeState({
      sortMode: 'title-az',
      documents: [
        makeDoc({ id: 'a', title: 'Zebra', pinned: false }),
        makeDoc({ id: 'b', title: 'Alpha', pinned: true }),
        makeDoc({ id: 'c', title: 'Middle', pinned: false }),
      ],
    });

    const result = getFilteredDocuments(state);
    expect(result.map((d) => d.id)).toEqual(['b', 'c', 'a']);
  });

  it('combines search + tags + sort', () => {
    const state = makeState({
      searchQuery: 'post',
      activeTagFilters: ['blog'],
      sortMode: 'title-az',
      documents: [
        makeDoc({ id: 'a', title: 'Blog Post 2', tags: ['blog'] }),
        makeDoc({ id: 'b', title: 'Meeting Notes', tags: ['work'] }),
        makeDoc({ id: 'c', title: 'Blog Post 1', tags: ['blog'] }),
        makeDoc({ id: 'd', title: 'Posted Update', tags: ['blog', 'news'] }),
      ],
    });

    const result = getFilteredDocuments(state);
    // "Blog Post 1", "Blog Post 2", "Posted Update" match search + tag
    expect(result.length).toBe(3);
    expect(result.map((d) => d.id)).toEqual(['c', 'a', 'd']); // title A-Z
  });

  it('returns empty when no documents match', () => {
    const state = makeState({
      searchQuery: 'xyz',
      documents: [
        makeDoc({ id: 'a', title: 'Hello' }),
        makeDoc({ id: 'b', title: 'World' }),
      ],
    });

    const result = getFilteredDocuments(state);
    expect(result.length).toBe(0);
  });

  it('excludes trashed documents from search results', () => {
    const state = makeState({
      searchQuery: 'blog',
      documents: [
        makeDoc({ id: 'a', title: 'Blog Active', deletedAt: null }),
        makeDoc({ id: 'b', title: 'Blog Trashed', deletedAt: 5000 }),
      ],
    });

    const result = getFilteredDocuments(state);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('a');
  });
});
