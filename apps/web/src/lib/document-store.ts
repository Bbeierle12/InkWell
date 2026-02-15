/**
 * Document Store — Zustand store with IndexedDB backend.
 *
 * Manages document persistence: save, load, list, delete.
 * Uses IndexedDB for storage so documents survive page reloads.
 */

import { create } from 'zustand';
import type { Editor } from '@tiptap/core';

// ── IndexedDB Constants ──

const DB_NAME = 'inkwell-documents';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

// ── Types ──

export interface StoredDocument {
  id: string;
  title: string;
  content: Record<string, unknown>; // editor.getJSON()
  createdAt: number;
  updatedAt: number;
}

interface DocumentStoreState {
  documentId: string | null;
  title: string;
  isDirty: boolean;
  lastSavedAt: number | null;
  autoSaveIntervalMs: number;

  markDirty: () => void;
  markClean: () => void;
  save: (editor: Editor) => Promise<void>;
  load: (id: string, editor: Editor) => Promise<void>;
  listDocuments: () => Promise<StoredDocument[]>;
  deleteDocument: (id: string) => Promise<void>;
  newDocument: (editor: Editor) => void;
}

// ── IndexedDB Helpers ──

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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
      resolve(request.result as StoredDocument | undefined);
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
      // Sort descending by updatedAt (most recent first)
      const docs = (request.result as StoredDocument[]).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
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

// ── Zustand Store ──

export const useDocumentStore = create<DocumentStoreState>((set, get) => ({
  documentId: null,
  title: 'Untitled',
  isDirty: false,
  lastSavedAt: null,
  autoSaveIntervalMs: 30_000,

  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),

  save: async (editor: Editor) => {
    const state = get();
    const id = state.documentId ?? generateId();
    const now = Date.now();

    const existing = await getDocument(id);

    const doc: StoredDocument = {
      id,
      title: state.title,
      content: editor.getJSON() as Record<string, unknown>,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await putDocument(doc);
    set({ documentId: id, isDirty: false, lastSavedAt: now });
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

  deleteDocument: async (id: string) => {
    await removeDocument(id);
    const state = get();
    if (state.documentId === id) {
      set({ documentId: null, title: 'Untitled', isDirty: false, lastSavedAt: null });
    }
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
}));
