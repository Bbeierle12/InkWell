import { describe, it, expect } from 'vitest';
import { markdownToEditorJson } from '../markdown-import';

describe('markdownToEditorJson', () => {
  describe('paragraphs', () => {
    it('should convert a plain paragraph', () => {
      const result = markdownToEditorJson('Hello world');
      expect(result.type).toBe('doc');
      const content = result.content as Array<Record<string, unknown>>;
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('paragraph');
      const inner = content[0].content as Array<Record<string, unknown>>;
      expect(inner[0]).toEqual({ type: 'text', text: 'Hello world' });
    });

    it('should handle multiple paragraphs separated by blank lines', () => {
      const result = markdownToEditorJson('First\n\nSecond');
      const content = result.content as Array<Record<string, unknown>>;
      expect(content).toHaveLength(2);
      expect(content[0].type).toBe('paragraph');
      expect(content[1].type).toBe('paragraph');
    });

    it('should return empty paragraph for empty input', () => {
      const result = markdownToEditorJson('');
      const content = result.content as Array<Record<string, unknown>>;
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('paragraph');
    });
  });

  describe('headings', () => {
    it('should convert h1', () => {
      const result = markdownToEditorJson('# Title');
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('heading');
      expect((content[0].attrs as Record<string, unknown>).level).toBe(1);
    });

    it('should convert h2 through h6', () => {
      for (let level = 2; level <= 6; level++) {
        const md = '#'.repeat(level) + ' Heading';
        const result = markdownToEditorJson(md);
        const content = result.content as Array<Record<string, unknown>>;
        expect((content[0].attrs as Record<string, unknown>).level).toBe(level);
      }
    });

    it('should preserve inline marks in headings', () => {
      const result = markdownToEditorJson('# **Bold** heading');
      const content = result.content as Array<Record<string, unknown>>;
      const inner = content[0].content as Array<Record<string, unknown>>;
      const boldNode = inner.find(
        (n) => (n.marks as Array<Record<string, unknown>>)?.some((m) => m.type === 'bold'),
      );
      expect(boldNode).toBeTruthy();
    });
  });

  describe('inline marks', () => {
    it('should parse bold (**)', () => {
      const result = markdownToEditorJson('**bold text**');
      const content = result.content as Array<Record<string, unknown>>;
      const inner = content[0].content as Array<Record<string, unknown>>;
      expect(inner[0]).toEqual({
        type: 'text',
        text: 'bold text',
        marks: [{ type: 'bold' }],
      });
    });

    it('should parse italic (*)', () => {
      const result = markdownToEditorJson('*italic text*');
      const content = result.content as Array<Record<string, unknown>>;
      const inner = content[0].content as Array<Record<string, unknown>>;
      expect(inner[0]).toEqual({
        type: 'text',
        text: 'italic text',
        marks: [{ type: 'italic' }],
      });
    });

    it('should parse inline code (`)', () => {
      const result = markdownToEditorJson('use `const` here');
      const content = result.content as Array<Record<string, unknown>>;
      const inner = content[0].content as Array<Record<string, unknown>>;
      const codeNode = inner.find(
        (n) => (n.marks as Array<Record<string, unknown>>)?.some((m) => m.type === 'code'),
      );
      expect(codeNode).toBeTruthy();
      expect(codeNode!.text).toBe('const');
    });

    it('should parse strikethrough (~~)', () => {
      const result = markdownToEditorJson('~~deleted~~');
      const content = result.content as Array<Record<string, unknown>>;
      const inner = content[0].content as Array<Record<string, unknown>>;
      expect(inner[0]).toEqual({
        type: 'text',
        text: 'deleted',
        marks: [{ type: 'strike' }],
      });
    });

    it('should handle mixed inline marks in a paragraph', () => {
      const result = markdownToEditorJson('plain **bold** and *italic* end');
      const content = result.content as Array<Record<string, unknown>>;
      const inner = content[0].content as Array<Record<string, unknown>>;
      expect(inner.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('lists', () => {
    it('should convert bullet list with -', () => {
      const md = '- Item one\n- Item two\n- Item three';
      const result = markdownToEditorJson(md);
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('bulletList');
      const items = content[0].content as Array<Record<string, unknown>>;
      expect(items).toHaveLength(3);
      expect(items[0].type).toBe('listItem');
    });

    it('should convert bullet list with *', () => {
      const md = '* First\n* Second';
      const result = markdownToEditorJson(md);
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('bulletList');
    });

    it('should convert ordered list', () => {
      const md = '1. First\n2. Second\n3. Third';
      const result = markdownToEditorJson(md);
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('orderedList');
      const items = content[0].content as Array<Record<string, unknown>>;
      expect(items).toHaveLength(3);
    });

    it('should parse inline marks within list items', () => {
      const md = '- **Bold item**\n- *Italic item*';
      const result = markdownToEditorJson(md);
      const content = result.content as Array<Record<string, unknown>>;
      const items = content[0].content as Array<Record<string, unknown>>;
      const firstPara = (items[0].content as Array<Record<string, unknown>>)[0];
      const firstInner = (firstPara as Record<string, unknown>).content as Array<Record<string, unknown>>;
      expect(firstInner[0].marks).toEqual([{ type: 'bold' }]);
    });
  });

  describe('blockquotes', () => {
    it('should convert a single-line blockquote', () => {
      const result = markdownToEditorJson('> Quote text');
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('blockquote');
    });

    it('should merge consecutive blockquote lines', () => {
      const md = '> Line one\n> Line two';
      const result = markdownToEditorJson(md);
      const content = result.content as Array<Record<string, unknown>>;
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('blockquote');
    });
  });

  describe('code blocks', () => {
    it('should convert a fenced code block', () => {
      const md = '```\nconst x = 1;\n```';
      const result = markdownToEditorJson(md);
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('codeBlock');
      const inner = content[0].content as Array<Record<string, unknown>>;
      expect(inner[0].text).toBe('const x = 1;');
    });

    it('should capture language annotation', () => {
      const md = '```typescript\nconst x: number = 1;\n```';
      const result = markdownToEditorJson(md);
      const content = result.content as Array<Record<string, unknown>>;
      expect((content[0].attrs as Record<string, unknown>).language).toBe('typescript');
    });

    it('should handle multi-line code blocks', () => {
      const md = '```js\nline1\nline2\nline3\n```';
      const result = markdownToEditorJson(md);
      const content = result.content as Array<Record<string, unknown>>;
      const inner = content[0].content as Array<Record<string, unknown>>;
      expect(inner[0].text).toBe('line1\nline2\nline3');
    });
  });

  describe('horizontal rules', () => {
    it('should convert --- to horizontalRule', () => {
      const result = markdownToEditorJson('---');
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('horizontalRule');
    });

    it('should convert *** to horizontalRule', () => {
      const result = markdownToEditorJson('***');
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('horizontalRule');
    });

    it('should convert ___ to horizontalRule', () => {
      const result = markdownToEditorJson('___');
      const content = result.content as Array<Record<string, unknown>>;
      expect(content[0].type).toBe('horizontalRule');
    });
  });

  describe('complex documents', () => {
    it('should handle a mixed-content document', () => {
      const md = [
        '# My Document',
        '',
        'A paragraph with **bold** and *italic*.',
        '',
        '## Section Two',
        '',
        '- Item A',
        '- Item B',
        '',
        '> A quote',
        '',
        '```js',
        'console.log("hi");',
        '```',
        '',
        '---',
        '',
        'Final paragraph.',
      ].join('\n');

      const result = markdownToEditorJson(md);
      const content = result.content as Array<Record<string, unknown>>;
      const types = content.map((n) => n.type);
      expect(types).toEqual([
        'heading',
        'paragraph',
        'heading',
        'bulletList',
        'blockquote',
        'codeBlock',
        'horizontalRule',
        'paragraph',
      ]);
    });
  });
});
