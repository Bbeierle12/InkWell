/**
 * Markdown Export Tests
 *
 * Tests the TipTap JSON → Markdown conversion.
 */
import { describe, it, expect } from 'vitest';
import { editorJsonToMarkdown } from '../markdown-export';

describe('editorJsonToMarkdown', () => {
  it('converts a paragraph to plain text', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    };

    expect(editorJsonToMarkdown(json)).toBe('Hello world');
  });

  it('converts headings with correct prefix', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Title' }],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Subtitle' }],
        },
      ],
    };

    const md = editorJsonToMarkdown(json);
    expect(md).toContain('# Title');
    expect(md).toContain('## Subtitle');
  });

  it('wraps bold text in double asterisks', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'text', text: 'world', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    };

    expect(editorJsonToMarkdown(json)).toBe('Hello **world**');
  });

  it('wraps italic text in single asterisks', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'emphasis', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    };

    expect(editorJsonToMarkdown(json)).toBe('*emphasis*');
  });

  it('converts bullet lists', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Item A' }] },
              ],
            },
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Item B' }] },
              ],
            },
          ],
        },
      ],
    };

    const md = editorJsonToMarkdown(json);
    expect(md).toContain('- Item A');
    expect(md).toContain('- Item B');
  });

  it('converts ordered lists', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
              ],
            },
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
              ],
            },
          ],
        },
      ],
    };

    const md = editorJsonToMarkdown(json);
    expect(md).toContain('1. First');
    expect(md).toContain('2. Second');
  });

  it('converts horizontal rule', () => {
    const json = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Above' }] },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'Below' }] },
      ],
    };

    const md = editorJsonToMarkdown(json);
    expect(md).toContain('---');
  });

  it('handles empty document', () => {
    const json = { type: 'doc', content: [] };
    expect(editorJsonToMarkdown(json)).toBe('');
  });
});
