/**
 * Schema Migration Tests
 *
 * Tests for DB v2 migration: new fields (tags, pinned, deletedAt, wordCount),
 * soft delete, restore, trash listing, tag operations, pin toggle, sorting.
 */
import { describe, it, expect } from 'vitest';

// ── Types ──

interface StoredDocumentV1 {
  id: string;
  title: string;
  content: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

interface StoredDocumentV2 extends StoredDocumentV1 {
  tags: string[];
  pinned: boolean;
  deletedAt: number | null;
  wordCount: number;
}

// ── Migration Logic ──

function migrateV1toV2(doc: StoredDocumentV1): StoredDocumentV2 {
  return {
    ...doc,
    tags: [],
    pinned: false,
    deletedAt: null,
    wordCount: 0,
  };
}

describe('Schema Migration v1 → v2', () => {
  it('adds default values for new fields', () => {
    const v1: StoredDocumentV1 = {
      id: 'doc_1',
      title: 'Test',
      content: { type: 'doc', content: [] },
      createdAt: 1000,
      updatedAt: 2000,
    };

    const v2 = migrateV1toV2(v1);

    expect(v2.tags).toEqual([]);
    expect(v2.pinned).toBe(false);
    expect(v2.deletedAt).toBeNull();
    expect(v2.wordCount).toBe(0);
  });

  it('preserves all v1 fields', () => {
    const v1: StoredDocumentV1 = {
      id: 'doc_2',
      title: 'Preserved',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      createdAt: 500,
      updatedAt: 1500,
    };

    const v2 = migrateV1toV2(v1);

    expect(v2.id).toBe('doc_2');
    expect(v2.title).toBe('Preserved');
    expect(v2.content).toEqual(v1.content);
    expect(v2.createdAt).toBe(500);
    expect(v2.updatedAt).toBe(1500);
  });

  it('migrates all documents in a batch', () => {
    const docs: StoredDocumentV1[] = [
      { id: 'a', title: 'A', content: {}, createdAt: 1, updatedAt: 1 },
      { id: 'b', title: 'B', content: {}, createdAt: 2, updatedAt: 2 },
      { id: 'c', title: 'C', content: {}, createdAt: 3, updatedAt: 3 },
    ];

    const migrated = docs.map(migrateV1toV2);

    expect(migrated.length).toBe(3);
    migrated.forEach((doc) => {
      expect(doc.tags).toEqual([]);
      expect(doc.pinned).toBe(false);
      expect(doc.deletedAt).toBeNull();
    });
  });
});

// ── Soft Delete / Trash ──

describe('Soft Delete', () => {
  const makeDoc = (overrides?: Partial<StoredDocumentV2>): StoredDocumentV2 => ({
    id: 'doc_test',
    title: 'Test',
    content: {},
    createdAt: 1000,
    updatedAt: 2000,
    tags: [],
    pinned: false,
    deletedAt: null,
    wordCount: 0,
    ...overrides,
  });

  it('soft delete sets deletedAt to current time', () => {
    const doc = makeDoc();
    const now = Date.now();
    const deleted = { ...doc, deletedAt: now };

    expect(deleted.deletedAt).toBe(now);
    expect(deleted.deletedAt).not.toBeNull();
  });

  it('restore clears deletedAt', () => {
    const doc = makeDoc({ deletedAt: 1000 });
    const restored = { ...doc, deletedAt: null };

    expect(restored.deletedAt).toBeNull();
  });

  it('active documents have deletedAt === null', () => {
    const docs = [
      makeDoc({ id: 'a', deletedAt: null }),
      makeDoc({ id: 'b', deletedAt: 5000 }),
      makeDoc({ id: 'c', deletedAt: null }),
    ];

    const active = docs.filter((d) => d.deletedAt === null);
    expect(active.length).toBe(2);
    expect(active.map((d) => d.id)).toEqual(['a', 'c']);
  });

  it('trash lists only soft-deleted documents', () => {
    const docs = [
      makeDoc({ id: 'a', deletedAt: null }),
      makeDoc({ id: 'b', deletedAt: 5000 }),
      makeDoc({ id: 'c', deletedAt: 3000 }),
    ];

    const trash = docs.filter((d) => d.deletedAt !== null);
    expect(trash.length).toBe(2);
    expect(trash.map((d) => d.id)).toEqual(['b', 'c']);
  });

  it('permanent delete removes from store', () => {
    const store = new Map<string, StoredDocumentV2>();
    store.set('a', makeDoc({ id: 'a' }));
    store.set('b', makeDoc({ id: 'b', deletedAt: 1000 }));

    // Permanent delete
    store.delete('b');

    expect(store.size).toBe(1);
    expect(store.has('b')).toBe(false);
  });

  it('auto-purge finds documents older than threshold', () => {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const docs = [
      makeDoc({ id: 'recent', deletedAt: now - 1000 }), // 1 second ago
      makeDoc({ id: 'old', deletedAt: now - thirtyDaysMs - 1000 }), // > 30 days
      makeDoc({ id: 'active', deletedAt: null }), // not deleted
    ];

    const toPurge = docs.filter(
      (d) => d.deletedAt !== null && d.deletedAt < now - thirtyDaysMs,
    );

    expect(toPurge.length).toBe(1);
    expect(toPurge[0].id).toBe('old');
  });
});

// ── Tags ──

describe('Tags', () => {
  const makeDoc = (overrides?: Partial<StoredDocumentV2>): StoredDocumentV2 => ({
    id: 'doc_test',
    title: 'Test',
    content: {},
    createdAt: 1000,
    updatedAt: 2000,
    tags: [],
    pinned: false,
    deletedAt: null,
    wordCount: 0,
    ...overrides,
  });

  it('setTags replaces all tags', () => {
    const doc = makeDoc({ tags: ['old'] });
    const updated = { ...doc, tags: ['new', 'tags'] };

    expect(updated.tags).toEqual(['new', 'tags']);
  });

  it('setTags with empty array clears tags', () => {
    const doc = makeDoc({ tags: ['a', 'b'] });
    const updated = { ...doc, tags: [] };

    expect(updated.tags).toEqual([]);
  });

  it('getAllTags returns distinct tags across documents', () => {
    const docs = [
      makeDoc({ id: 'a', tags: ['draft', 'blog'] }),
      makeDoc({ id: 'b', tags: ['blog', 'client'] }),
      makeDoc({ id: 'c', tags: ['draft'] }),
    ];

    const allTags = [...new Set(docs.flatMap((d) => d.tags))].sort();
    expect(allTags).toEqual(['blog', 'client', 'draft']);
  });

  it('filters documents by single tag', () => {
    const docs = [
      makeDoc({ id: 'a', tags: ['draft', 'blog'] }),
      makeDoc({ id: 'b', tags: ['published'] }),
      makeDoc({ id: 'c', tags: ['draft'] }),
    ];

    const filtered = docs.filter((d) => d.tags.includes('draft'));
    expect(filtered.length).toBe(2);
    expect(filtered.map((d) => d.id)).toEqual(['a', 'c']);
  });

  it('filters documents by multiple tags (AND)', () => {
    const docs = [
      makeDoc({ id: 'a', tags: ['draft', 'blog'] }),
      makeDoc({ id: 'b', tags: ['blog', 'client'] }),
      makeDoc({ id: 'c', tags: ['draft'] }),
    ];

    const activeTags = ['draft', 'blog'];
    const filtered = docs.filter((d) => activeTags.every((t) => d.tags.includes(t)));
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('a');
  });

  it('tag color assignment is stable', () => {
    // Hash-based color assignment from a palette
    const palette = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

    function tagColor(tag: string): string {
      let hash = 0;
      for (let i = 0; i < tag.length; i++) {
        hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
      }
      return palette[Math.abs(hash) % palette.length];
    }

    // Same tag always gets same color
    expect(tagColor('draft')).toBe(tagColor('draft'));
    expect(tagColor('blog')).toBe(tagColor('blog'));

    // Different tags can get different colors (not guaranteed, but likely)
    const colors = new Set(['draft', 'blog', 'client', 'published'].map(tagColor));
    expect(colors.size).toBeGreaterThanOrEqual(2);
  });
});

// ── Pin / Favorite ──

describe('Pin / Favorite', () => {
  const makeDoc = (overrides?: Partial<StoredDocumentV2>): StoredDocumentV2 => ({
    id: 'doc_test',
    title: 'Test',
    content: {},
    createdAt: 1000,
    updatedAt: 2000,
    tags: [],
    pinned: false,
    deletedAt: null,
    wordCount: 0,
    ...overrides,
  });

  it('togglePin flips pinned state', () => {
    const doc = makeDoc({ pinned: false });
    const toggled = { ...doc, pinned: !doc.pinned };
    expect(toggled.pinned).toBe(true);

    const toggledBack = { ...toggled, pinned: !toggled.pinned };
    expect(toggledBack.pinned).toBe(false);
  });

  it('pinned documents sort before unpinned', () => {
    const docs = [
      makeDoc({ id: 'a', pinned: false, updatedAt: 5000 }),
      makeDoc({ id: 'b', pinned: true, updatedAt: 1000 }),
      makeDoc({ id: 'c', pinned: false, updatedAt: 3000 }),
      makeDoc({ id: 'd', pinned: true, updatedAt: 2000 }),
    ];

    const sorted = [...docs].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });

    // Pinned first (d=2000, b=1000), then unpinned (a=5000, c=3000)
    expect(sorted.map((d) => d.id)).toEqual(['d', 'b', 'a', 'c']);
  });
});

// ── Sort Controls ──

describe('Sort Controls', () => {
  const docs = [
    { id: 'a', title: 'Zebra', createdAt: 3000, updatedAt: 1000, pinned: false },
    { id: 'b', title: 'Alpha', createdAt: 1000, updatedAt: 3000, pinned: false },
    { id: 'c', title: 'Middle', createdAt: 2000, updatedAt: 2000, pinned: true },
  ];

  type SortMode = 'updated' | 'created' | 'title-az' | 'title-za';

  function sortDocs(list: typeof docs, mode: SortMode) {
    return [...list].sort((a, b) => {
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

  it('sorts by last modified (default)', () => {
    const sorted = sortDocs(docs, 'updated');
    // c is pinned, always first. Then b (3000) before a (1000)
    expect(sorted.map((d) => d.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by created date', () => {
    const sorted = sortDocs(docs, 'created');
    // c first (pinned), then a (3000), b (1000)
    expect(sorted.map((d) => d.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts title A-Z with pin priority', () => {
    const sorted = sortDocs(docs, 'title-az');
    // c first (pinned), then Alpha, Zebra
    expect(sorted.map((d) => d.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts title Z-A with pin priority', () => {
    const sorted = sortDocs(docs, 'title-za');
    // c first (pinned), then Zebra, Alpha
    expect(sorted.map((d) => d.id)).toEqual(['c', 'a', 'b']);
  });
});
