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
import { isTauriRuntime, invokeTauri } from './tauri-bridge';

// ── IndexedDB Constants ──

const DB_NAME = 'inkwell-documents';
const DB_VERSION = 2;
const STORE_NAME = 'documents';

// localStorage flag marking the one-time IndexedDB → Rust-backend migration done.
const MIGRATION_FLAG = 'inkwell-idb-migrated';

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
  documents: StoredDocument[];
  sidebarOpen: boolean;
  sortMode: SortMode;
  searchQuery: string;
  activeTagFilters: string[];
  showTrash: boolean;

  markDirty: () => void;
  markClean: () => void;
  setTitle: (title: string) => void;
  openExternalDocument: (title: string) => void;
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
  newDocument: (editor: Editor) => Promise<void>;
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

async function idbPutDocument(doc: StoredDocument): Promise<void> {
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

async function idbGetDocument(id: string): Promise<StoredDocument | undefined> {
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

async function idbGetAllDocuments(): Promise<StoredDocument[]> {
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

async function idbRemoveDocument(id: string): Promise<void> {
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

// ── Backend dispatch ──
//
// Desktop (Tauri) persists through the Rust SQLite backend, so storage is
// independent of the webview engine (a WebKit version skew can no longer hide
// documents). Web builds keep using IndexedDB. The idb* functions above stay
// available for the one-time migration.

const backendPut = (doc: StoredDocument): Promise<void> =>
  invokeTauri<void>('document_put', { doc });
const backendGet = (id: string): Promise<StoredDocument | null> =>
  invokeTauri<StoredDocument | null>('document_get', { id });
const backendList = (): Promise<StoredDocument[]> =>
  invokeTauri<StoredDocument[]>('documents_list');
const backendRemove = (id: string): Promise<void> =>
  invokeTauri<void>('document_delete', { id });

async function putDocument(doc: StoredDocument): Promise<void> {
  return isTauriRuntime() ? backendPut(doc) : idbPutDocument(doc);
}

async function getDocument(id: string): Promise<StoredDocument | undefined> {
  if (isTauriRuntime()) return (await backendGet(id)) ?? undefined;
  return idbGetDocument(id);
}

async function getAllDocuments(): Promise<StoredDocument[]> {
  return isTauriRuntime() ? backendList() : idbGetAllDocuments();
}

async function removeDocument(id: string): Promise<void> {
  return isTauriRuntime() ? backendRemove(id) : idbRemoveDocument(id);
}

let migrationChecked = false;

/**
 * One-time migration: copy documents from the legacy IndexedDB store into the
 * Rust SQLite backend. Runs once on the first Tauri launch after upgrading, only
 * when the backend is still empty. Idempotent and non-fatal — a failure leaves
 * the app working (backend stays the source of truth) and retries next launch.
 */
async function migrateToBackendIfNeeded(): Promise<void> {
  if (!isTauriRuntime() || migrationChecked) return;

  const flagged =
    typeof localStorage !== 'undefined' && localStorage.getItem(MIGRATION_FLAG) === '1';
  if (flagged) {
    migrationChecked = true;
    return;
  }

  try {
    // Only seed an empty backend; never overwrite documents already migrated.
    const existing = await backendList();
    if (existing.length === 0) {
      const legacy = await idbGetAllDocuments();
      for (const doc of legacy) {
        await backendPut(doc); // preserves deletedAt, so trashed docs stay trashed
      }
      if (legacy.length > 0) {
        console.info(`Inkwell: migrated ${legacy.length} document(s) from IndexedDB to the backend`);
      }
    }
    if (typeof localStorage !== 'undefined') localStorage.setItem(MIGRATION_FLAG, '1');
    migrationChecked = true;
  } catch (err) {
    // Leave unflagged so a later launch can retry once IndexedDB is readable.
    console.error('Inkwell: IndexedDB → backend migration failed', err);
  }
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
  documents: [],
  sidebarOpen: true,
  sortMode: 'updated' as SortMode,
  searchQuery: '',
  activeTagFilters: [],
  showTrash: false,

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  setTitle: (title: string) => set({ title: title.trim(), isDirty: true }),
  openExternalDocument: (title: string) =>
    set({
      documentId: null,
      title: title.trim() || 'Untitled',
      isDirty: false,
      lastSavedAt: null,
    }),

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
    await migrateToBackendIfNeeded();
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

  newDocument: async (editor: Editor) => {
    const state = get();

    // Save current document if dirty
    if (state.documentId && state.isDirty) {
      const content = editor.getJSON() as Record<string, unknown>;
      const existing = await getDocument(state.documentId);
      if (existing) {
        await putDocument({
          ...existing,
          content,
          title: state.title,
          updatedAt: Date.now(),
          wordCount: countWordsFromContent(content),
        });
      }
    }

    // Clear editor and create new document
    editor.commands.clearContent();
    const newId = generateId();
    const now = Date.now();

    const newDoc: StoredDocument = {
      id: newId,
      title: 'Untitled',
      content: editor.getJSON() as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
      tags: [],
      pinned: false,
      deletedAt: null,
      wordCount: 0,
    };

    await putDocument(newDoc);
    set({
      documentId: newId,
      title: 'Untitled',
      isDirty: false,
      lastSavedAt: now,
    });

    const documents = await getAllDocuments();
    set({ documents });
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
