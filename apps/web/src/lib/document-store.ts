/**
 * Document Store — Zustand store with IndexedDB backend.
 *
 * Manages document persistence: save, load, list, delete, tags, pin, trash.
 * Uses IndexedDB for storage so documents survive page reloads.
 * Schema v2 adds tags, pinned, deletedAt, wordCount fields.
 */

import { create } from 'zustand';
import type { Editor } from '@tiptap/core';
import { countWordsFromContent } from './document-utils';

// ── IndexedDB Constants ──

const DB_NAME = 'inkwell-documents';
const DB_VERSION = 2;
const STORE_NAME = 'documents';

// ── Types ──

export interface StoredDocument {
  id: string;
  title: string;
  content: Record<string, unknown>; // editor.getJSON()
  createdAt: number;
  updatedAt: number;
  // v2 fields
  tags: string[];
  pinned: boolean;
  deletedAt: number | null;
  wordCount: number;
}

export type SortMode = 'updated' | 'created' | 'title-az' | 'title-za';

interface DocumentStoreState {
  documentId: string | null;
  title: string;
  isDirty: boolean;
  lastSavedAt: number | null;
  autoSaveIntervalMs: number;
  documents: StoredDocument[];
  sidebarOpen: boolean;
  sortMode: SortMode;
  searchQuery: string;
  activeTagFilters: string[];
  showTrash: boolean;

  markDirty: () => void;
  markClean: () => void;
  setTitle: (title: string) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setSortMode: (mode: SortMode) => void;
  setSearchQuery: (query: string) => void;
  setActiveTagFilters: (tags: string[]) => void;
  setShowTrash: (show: boolean) => void;
  save: (editor: Editor) => Promise<void>;
  load: (id: string, editor: Editor) => Promise<void>;
  listDocuments: () => Promise<StoredDocument[]>;
  refreshDocuments: () => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  softDelete: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  permanentDelete: (id: string) => Promise<void>;
  newDocument: (editor: Editor) => void;
  setTags: (id: string, tags: string[]) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  getAllTags: () => string[];
}

// ── IndexedDB Helpers ──

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;

      if (oldVersion < 1) {
        // Fresh install: create store with all indexes
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
      } else if (oldVersion < 2) {
        // Migrate v1 → v2: add tags index.
        // Backfill new fields happens at read time via ensureV2Fields().
        const store = request.transaction!.objectStore(STORE_NAME);
        if (!store.indexNames.contains('tags')) {
          store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Ensure a document has all v2 fields (backfill for migrated v1 docs).
 */
function ensureV2Fields(doc: Record<string, unknown>): StoredDocument {
  return {
    id: doc.id as string,
    title: doc.title as string,
    content: (doc.content ?? {}) as Record<string, unknown>,
    createdAt: doc.createdAt as number,
    updatedAt: doc.updatedAt as number,
    tags: (doc.tags as string[]) ?? [],
    pinned: (doc.pinned as boolean) ?? false,
    deletedAt: (doc.deletedAt as number | null) ?? null,
    wordCount: (doc.wordCount as number) ?? 0,
  };
}

async function putDocument(doc: StoredDocument): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(doc);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getDocument(id: string): Promise<StoredDocument | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => {
      db.close();
      const raw = request.result;
      resolve(raw ? ensureV2Fields(raw) : undefined);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function getAllDocuments(): Promise<StoredDocument[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('updatedAt');
    const request = index.getAll();
    request.onsuccess = () => {
      db.close();
      const docs = (request.result as Record<string, unknown>[])
        .map(ensureV2Fields)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(docs);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function removeDocument(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function generateId(): string {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Sorting ──

function sortDocuments(docs: StoredDocument[], mode: SortMode): StoredDocument[] {
  return [...docs].sort((a, b) => {
    // Pinned always first
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    switch (mode) {
      case 'updated':
        return b.updatedAt - a.updatedAt;
      case 'created':
        return b.createdAt - a.createdAt;
      case 'title-az':
        return a.title.localeCompare(b.title);
      case 'title-za':
        return b.title.localeCompare(a.title);
    }
  });
}

// ── Zustand Store ──

export const useDocumentStore = create<DocumentStoreState>((set, get) => ({
  documentId: null,
  title: 'Untitled',
  isDirty: false,
  lastSavedAt: null,
  autoSaveIntervalMs: 30_000,
  documents: [],
  sidebarOpen: true,
  sortMode: 'updated' as SortMode,
  searchQuery: '',
  activeTagFilters: [],
  showTrash: false,

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  setTitle: (title: string) => set({ title: title.trim(), isDirty: true }),

  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  setSortMode: (mode: SortMode) => set({ sortMode: mode }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setActiveTagFilters: (tags: string[]) => set({ activeTagFilters: tags }),
  setShowTrash: (show: boolean) => set({ showTrash: show }),

  save: async (editor: Editor) => {
    const state = get();
    const id = state.documentId ?? generateId();
    const now = Date.now();

    const existing = await getDocument(id);
    const content = editor.getJSON() as Record<string, unknown>;

    const doc: StoredDocument = {
      id,
      title: state.title,
      content,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      tags: existing?.tags ?? [],
      pinned: existing?.pinned ?? false,
      deletedAt: existing?.deletedAt ?? null,
      wordCount: countWordsFromContent(content),
    };

    await putDocument(doc);
    set({ documentId: id, isDirty: false, lastSavedAt: now });

    const documents = await getAllDocuments();
    set({ documents });
  },

  load: async (id: string, editor: Editor) => {
    const doc = await getDocument(id);
    if (!doc) return;

    editor.commands.setContent(doc.content);
    set({
      documentId: doc.id,
      title: doc.title,
      isDirty: false,
      lastSavedAt: doc.updatedAt,
    });
  },

  listDocuments: async () => {
    return getAllDocuments();
  },

  refreshDocuments: async () => {
    const documents = await getAllDocuments();
    set({ documents });
  },

  // Legacy hard delete (keeps backward compat with existing callers)
  deleteDocument: async (id: string) => {
    await removeDocument(id);
    const state = get();
    if (state.documentId === id) {
      set({ documentId: null, title: 'Untitled', isDirty: false, lastSavedAt: null });
    }
    const documents = await getAllDocuments();
    set({ documents });
  },

  softDelete: async (id: string) => {
    const doc = await getDocument(id);
    if (!doc) return;
    await putDocument({ ...doc, deletedAt: Date.now() });
    const state = get();
    if (state.documentId === id) {
      set({ documentId: null, title: 'Untitled', isDirty: false, lastSavedAt: null });
    }
    const documents = await getAllDocuments();
    set({ documents });
  },

  restore: async (id: string) => {
    const doc = await getDocument(id);
    if (!doc) return;
    await putDocument({ ...doc, deletedAt: null });
    const documents = await getAllDocuments();
    set({ documents });
  },

  permanentDelete: async (id: string) => {
    await removeDocument(id);
    const documents = await getAllDocuments();
    set({ documents });
  },

  newDocument: (editor: Editor) => {
    editor.commands.clearContent();
    set({
      documentId: null,
      title: 'Untitled',
      isDirty: false,
      lastSavedAt: null,
    });
  },

  setTags: async (id: string, tags: string[]) => {
    const doc = await getDocument(id);
    if (!doc) return;
    await putDocument({ ...doc, tags, updatedAt: Date.now() });
    const documents = await getAllDocuments();
    set({ documents });
  },

  togglePin: async (id: string) => {
    const doc = await getDocument(id);
    if (!doc) return;
    await putDocument({ ...doc, pinned: !doc.pinned, updatedAt: Date.now() });
    const documents = await getAllDocuments();
    set({ documents });
  },

  getAllTags: () => {
    const { documents } = get();
    return [...new Set(documents.flatMap((d) => d.tags))].sort();
  },
}));

/**
 * Get filtered and sorted documents from the store state.
 * Use this selector to compute the displayed document list.
 */
export function getFilteredDocuments(state: DocumentStoreState): StoredDocument[] {
  let docs = state.documents;

  // Filter by trash/active
  if (state.showTrash) {
    docs = docs.filter((d) => d.deletedAt !== null);
  } else {
    docs = docs.filter((d) => d.deletedAt === null);
  }

  // Filter by search query
  if (state.searchQuery.trim()) {
    const query = state.searchQuery.trim().toLowerCase();
    docs = docs.filter((d) => d.title.toLowerCase().includes(query));
  }

  // Filter by active tags (AND)
  if (state.activeTagFilters.length > 0) {
    docs = docs.filter((d) => state.activeTagFilters.every((t) => d.tags.includes(t)));
  }

  // Sort
  return sortDocuments(docs, state.sortMode);
}
