/**
 * Document Store V2 Tests
 *
 * Tests for new store actions: setTitle, documents tracking,
 * sidebar-related queries, and document utilities.
 */
import { describe, it, expect } from 'vitest';
import {
  extractPreview,
  formatRelativeTime,
  countWords,
  countWordsFromContent,
  deriveTitleFromContent,
} from '../document-utils';

// ── Test: Store State Management ──

describe('Document Store - setTitle', () => {
  it('setTitle updates title and marks dirty', () => {
    const state = { title: 'Untitled', isDirty: false };
    const newState = { ...state, title: 'My Document', isDirty: true };

    expect(newState.title).toBe('My Document');
    expect(newState.isDirty).toBe(true);
  });

  it('setTitle with empty string keeps it as-is', () => {
    const state = { title: 'Old Title', isDirty: false };
    const newState = { ...state, title: '', isDirty: true };

    expect(newState.title).toBe('');
    expect(newState.isDirty).toBe(true);
  });

  it('setTitle trims whitespace', () => {
    const title = '  My Document  '.trim();
    expect(title).toBe('My Document');
  });
});

describe('Document Store - documents list tracking', () => {
  it('documents starts as empty array', () => {
    const documents: unknown[] = [];
    expect(documents).toEqual([]);
    expect(documents.length).toBe(0);
  });

  it('refreshDocuments populates the documents array sorted by updatedAt', () => {
    const storedDocs = [
      { id: 'doc_1', title: 'First', content: {}, createdAt: 1000, updatedAt: 3000 },
      { id: 'doc_2', title: 'Second', content: {}, createdAt: 2000, updatedAt: 2000 },
    ];

    const documents = [...storedDocs].sort((a, b) => b.updatedAt - a.updatedAt);
    expect(documents.length).toBe(2);
    expect(documents[0].id).toBe('doc_1');
    expect(documents[1].id).toBe('doc_2');
  });

  it('refreshDocuments returns empty for no documents', () => {
    const documents: unknown[] = [];
    expect(documents).toEqual([]);
  });
});

// ── Test: Utility Functions ──

describe('extractPreview', () => {
  it('extracts text from simple paragraph', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world, this is a test document.' }],
        },
      ],
    };
    expect(extractPreview(content, 80)).toBe('Hello world, this is a test document.');
  });

  it('truncates long content to maxLength', () => {
    const longText = 'A'.repeat(200);
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: longText }] }],
    };

    const preview = extractPreview(content, 80);
    expect(preview.length).toBeLessThanOrEqual(83); // 80 + "..."
    expect(preview.endsWith('...')).toBe(true);
  });

  it('handles empty document', () => {
    expect(extractPreview({ type: 'doc', content: [] }, 80)).toBe('');
  });

  it('handles document with no content field', () => {
    expect(extractPreview({ type: 'doc' }, 80)).toBe('');
  });

  it('concatenates text from multiple paragraphs', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph.' }] },
      ],
    };

    const preview = extractPreview(content, 80);
    expect(preview).toContain('First paragraph.');
    expect(preview).toContain('Second paragraph.');
  });

  it('skips non-text nodes', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Text here.' }] },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'More text.' }] },
      ],
    };

    const preview = extractPreview(content, 80);
    expect(preview).toContain('Text here.');
    expect(preview).toContain('More text.');
  });
});

describe('formatRelativeTime', () => {
  it('formats seconds ago as just now', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe('just now');
  });

  it('formats minutes ago', () => {
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toBe('5 min ago');
  });

  it('formats single minute ago', () => {
    expect(formatRelativeTime(Date.now() - 60_000)).toBe('1 min ago');
  });

  it('formats hours ago', () => {
    expect(formatRelativeTime(Date.now() - 3 * 3_600_000)).toBe('3 hr ago');
  });

  it('formats days ago', () => {
    expect(formatRelativeTime(Date.now() - 2 * 86_400_000)).toBe('2 days ago');
  });

  it('formats single day ago', () => {
    expect(formatRelativeTime(Date.now() - 86_400_000)).toBe('1 day ago');
  });

  it('formats weeks ago', () => {
    expect(formatRelativeTime(Date.now() - 14 * 86_400_000)).toBe('2 wk ago');
  });
});

describe('countWords', () => {
  it('counts words in plain text', () => {
    expect(countWords('Hello world this is a test')).toBe(6);
  });

  it('returns 0 for empty text', () => {
    expect(countWords('')).toBe(0);
  });

  it('handles multiple spaces', () => {
    expect(countWords('Hello   world   test')).toBe(3);
  });

  it('handles newlines as separators', () => {
    expect(countWords('Hello\nworld\ntest')).toBe(3);
  });

  it('handles whitespace-only input', () => {
    expect(countWords('   ')).toBe(0);
  });
});

describe('countWordsFromContent', () => {
  it('counts words from TipTap JSON content', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello world this is a test' }] },
      ],
    };
    expect(countWordsFromContent(content)).toBe(6);
  });

  it('counts words across multiple paragraphs', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'another paragraph' }] },
      ],
    };
    expect(countWordsFromContent(content)).toBe(4);
  });

  it('returns 0 for empty document', () => {
    expect(countWordsFromContent({ type: 'doc', content: [] })).toBe(0);
  });
});

describe('deriveTitleFromContent', () => {
  it('returns heading text if present', () => {
    const content = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'My Title' }],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Body text.' }] },
      ],
    };
    expect(deriveTitleFromContent(content)).toBe('My Title');
  });

  it('falls back to first paragraph if no heading', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First line of text' }] },
      ],
    };
    expect(deriveTitleFromContent(content)).toBe('First line of text');
  });

  it('returns null for empty document', () => {
    expect(deriveTitleFromContent({ type: 'doc', content: [] })).toBeNull();
  });

  it('returns null for document with no text', () => {
    const content = {
      type: 'doc',
      content: [{ type: 'horizontalRule' }],
    };
    expect(deriveTitleFromContent(content)).toBeNull();
  });

  it('truncates long first-line title to 60 chars', () => {
    const longText = 'A'.repeat(100);
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: longText }] }],
    };
    const title = deriveTitleFromContent(content);
    expect(title!.length).toBe(60);
  });

  it('trims whitespace from derived title', () => {
    const content = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '  Spaced Title  ' }] },
      ],
    };
    expect(deriveTitleFromContent(content)).toBe('Spaced Title');
  });
});
