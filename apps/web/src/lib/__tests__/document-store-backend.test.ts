/**
 * Document Store — backend (Tauri) dispatch tests.
 *
 * When running inside a Tauri webview, the storage helpers must route to the
 * Rust SQLite backend via invokeTauri instead of IndexedDB. These tests mock
 * the bridge to report a Tauri environment and assert the correct commands fire.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('../tauri-bridge', () => ({
  isTauriRuntime: () => true,
  invokeTauri: (cmd: string, args?: Record<string, unknown>) => invokeMock(cmd, args),
}));

import { useDocumentStore, type StoredDocument } from '../document-store';

const doc = (id: string, updatedAt: number): StoredDocument => ({
  id,
  title: id,
  content: {},
  createdAt: 1,
  updatedAt,
  tags: [],
  pinned: false,
  deletedAt: null,
  wordCount: 0,
});

const initialState = useDocumentStore.getState();

beforeEach(() => {
  invokeMock.mockReset();
  useDocumentStore.setState({ ...initialState, documents: [], documentId: null });
});

describe('document store backend dispatch (Tauri)', () => {
  it('refreshDocuments lists from the backend', async () => {
    invokeMock.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === 'documents_list' ? [doc('doc_1', 3), doc('doc_2', 2)] : null),
    );

    await useDocumentStore.getState().refreshDocuments();

    expect(invokeMock).toHaveBeenCalledWith('documents_list', undefined);
    expect(useDocumentStore.getState().documents).toHaveLength(2);
  });

  it('permanentDelete deletes via the backend', async () => {
    invokeMock.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === 'documents_list' ? [] : undefined),
    );

    await useDocumentStore.getState().permanentDelete('doc_9');

    expect(invokeMock).toHaveBeenCalledWith('document_delete', { id: 'doc_9' });
  });

  it('setTags reads then writes the document via the backend', async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === 'document_get') return Promise.resolve(doc('doc_1', 2));
      if (cmd === 'documents_list') return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    await useDocumentStore.getState().setTags('doc_1', ['work', 'draft']);

    expect(invokeMock).toHaveBeenCalledWith('document_get', { id: 'doc_1' });
    const putCall = invokeMock.mock.calls.find((c) => c[0] === 'document_put');
    expect(putCall).toBeTruthy();
    expect((putCall![1] as { doc: StoredDocument }).doc.tags).toEqual(['work', 'draft']);
  });
});
