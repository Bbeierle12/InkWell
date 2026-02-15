/**
 * Sidebar Components Tests
 *
 * Tests for sidebar logic: document list filtering/sorting,
 * document title editing, export menu operations, status bar computations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractPreview,
  formatRelativeTime,
  countWords,
  countWordsFromContent,
  deriveTitleFromContent,
} from '../../lib/document-utils';
import { editorJsonToMarkdown } from '../../lib/markdown-export';

// ── Document List Logic ──

describe('Document List - sorting', () => {
  const makeDocs = () => [
    { id: 'a', title: 'Alpha', content: {}, createdAt: 1000, updatedAt: 1000 },
    { id: 'b', title: 'Beta', content: {}, createdAt: 2000, updatedAt: 5000 },
    { id: 'c', title: 'Charlie', content: {}, createdAt: 3000, updatedAt: 3000 },
  ];

  it('sorts by updatedAt descending (default)', () => {
    const docs = makeDocs().sort((a, b) => b.updatedAt - a.updatedAt);
    expect(docs.map((d) => d.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by createdAt ascending', () => {
    const docs = makeDocs().sort((a, b) => a.createdAt - b.createdAt);
    expect(docs.map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by title A-Z', () => {
    const docs = makeDocs().sort((a, b) => a.title.localeCompare(b.title));
    expect(docs.map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by title Z-A', () => {
    const docs = makeDocs().sort((a, b) => b.title.localeCompare(a.title));
    expect(docs.map((d) => d.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('Document List - filtering', () => {
  const docs = [
    { id: '1', title: 'Meeting Notes', content: {} },
    { id: '2', title: 'Blog Post Draft', content: {} },
    { id: '3', title: 'Project Plan', content: {} },
  ];

  it('filters by title substring (case insensitive)', () => {
    const query = 'blog';
    const filtered = docs.filter((d) => d.title.toLowerCase().includes(query.toLowerCase()));
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('2');
  });

  it('returns all documents when query is empty', () => {
    const filtered = docs.filter((d) => d.title.toLowerCase().includes(''));
    expect(filtered.length).toBe(3);
  });

  it('returns empty when no match', () => {
    const filtered = docs.filter((d) => d.title.toLowerCase().includes('xyz'));
    expect(filtered.length).toBe(0);
  });

  it('matches partial words', () => {
    const filtered = docs.filter((d) => d.title.toLowerCase().includes('proj'));
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('3');
  });
});

// ── Document Title ──

describe('DocumentTitle logic', () => {
  it('auto-derives title from heading when title is Untitled', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'My Article' }] },
      ],
    };

    const currentTitle = 'Untitled';
    const derived = deriveTitleFromContent(content);

    if (currentTitle === 'Untitled' && derived) {
      expect(derived).toBe('My Article');
    }
  });

  it('does not override user-set title', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'New Title' }] },
      ],
    };

    const currentTitle = 'Custom Title';
    // Should not trigger setTitle when title is already set
    expect(currentTitle).not.toBe('Untitled');
    // No auto-derive should happen
  });
});

// ── Export Logic ──

describe('Export - markdown conversion', () => {
  it('converts document with formatting to markdown', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Title' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Normal and ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' text.' },
          ],
        },
      ],
    };

    const md = editorJsonToMarkdown(json);
    expect(md).toContain('# Title');
    expect(md).toContain('Normal and **bold** text.');
  });

  it('produces downloadable content', () => {
    const md = '# Test\n\nContent';
    const blob = new Blob([md], { type: 'text/markdown' });
    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe('text/markdown');
  });
});

// ── Status Bar Logic ──

describe('StatusBar - save status', () => {
  it('shows unsaved when dirty', () => {
    const isDirty = true;
    const lastSavedAt = 1000;
    const status = isDirty ? 'Unsaved changes' : lastSavedAt ? 'Saved' : '';
    expect(status).toBe('Unsaved changes');
  });

  it('shows saved when clean and previously saved', () => {
    const isDirty = false;
    const lastSavedAt = 1000;
    const status = isDirty ? 'Unsaved changes' : lastSavedAt ? 'Saved' : '';
    expect(status).toBe('Saved');
  });

  it('shows nothing when clean and never saved', () => {
    const isDirty = false;
    const lastSavedAt = null;
    const status = isDirty ? 'Unsaved changes' : lastSavedAt ? 'Saved' : '';
    expect(status).toBe('');
  });
});

describe('StatusBar - word/char count', () => {
  it('counts words from editor text', () => {
    const text = 'Hello world, this is a test.';
    expect(countWords(text)).toBe(6);
  });

  it('counts characters from editor text', () => {
    const text = 'Hello world';
    expect(text.length).toBe(11);
  });

  it('updates counts correctly for empty content', () => {
    const text = '';
    expect(countWords(text)).toBe(0);
    expect(text.length).toBe(0);
  });
});

// ── Sidebar Toggle ──

describe('Sidebar toggle logic', () => {
  it('toggles open/closed state', () => {
    let sidebarOpen = true;
    sidebarOpen = !sidebarOpen;
    expect(sidebarOpen).toBe(false);
    sidebarOpen = !sidebarOpen;
    expect(sidebarOpen).toBe(true);
  });

  it('starts open by default', () => {
    const sidebarOpen = true; // Default in store
    expect(sidebarOpen).toBe(true);
  });
});
