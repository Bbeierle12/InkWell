import { describe, it, expect } from 'vitest';
import {
  serializeInkwellFile,
  deserializeInkwellFile,
} from '../inkwell-format';

describe('inkwell-format', () => {
  const sampleContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello world' }],
      },
    ],
  };

  describe('serializeInkwellFile', () => {
    it('should produce valid JSON with version 1', () => {
      const json = serializeInkwellFile('Test Doc', sampleContent);
      const parsed = JSON.parse(json);
      expect(parsed.version).toBe(1);
      expect(parsed.metadata.title).toBe('Test Doc');
      expect(parsed.content).toEqual(sampleContent);
    });

    it('should include default metadata fields', () => {
      const json = serializeInkwellFile('My Title', sampleContent);
      const parsed = JSON.parse(json);
      expect(parsed.metadata.tags).toEqual([]);
      expect(parsed.metadata.wordCount).toBe(0);
      expect(parsed.metadata.createdAt).toBeTruthy();
      expect(parsed.metadata.updatedAt).toBeTruthy();
    });

    it('should apply optional tags and wordCount', () => {
      const json = serializeInkwellFile('Tagged', sampleContent, {
        tags: ['draft', 'fiction'],
        wordCount: 150,
      });
      const parsed = JSON.parse(json);
      expect(parsed.metadata.tags).toEqual(['draft', 'fiction']);
      expect(parsed.metadata.wordCount).toBe(150);
    });

    it('should preserve a provided createdAt', () => {
      const created = '2026-01-01T00:00:00.000Z';
      const json = serializeInkwellFile('Old Doc', sampleContent, {
        createdAt: created,
      });
      const parsed = JSON.parse(json);
      expect(parsed.metadata.createdAt).toBe(created);
    });
  });

  describe('deserializeInkwellFile', () => {
    it('should roundtrip serialize → deserialize', () => {
      const json = serializeInkwellFile('Roundtrip', sampleContent, {
        tags: ['test'],
        wordCount: 42,
      });
      const result = deserializeInkwellFile(json);
      expect(result.version).toBe(1);
      expect(result.metadata.title).toBe('Roundtrip');
      expect(result.metadata.tags).toEqual(['test']);
      expect(result.metadata.wordCount).toBe(42);
      expect(result.content).toEqual(sampleContent);
    });

    it('should throw on malformed JSON', () => {
      expect(() => deserializeInkwellFile('not json{')).toThrow('malformed JSON');
    });

    it('should throw on non-object root', () => {
      expect(() => deserializeInkwellFile('"string"')).toThrow('root must be an object');
      expect(() => deserializeInkwellFile('[1,2]')).toThrow('root must be an object');
    });

    it('should throw on missing version', () => {
      const json = JSON.stringify({ metadata: {}, content: {} });
      expect(() => deserializeInkwellFile(json)).toThrow('missing or invalid version');
    });

    it('should throw on unsupported version', () => {
      const json = JSON.stringify({
        version: 2,
        metadata: { title: 'X' },
        content: {},
      });
      expect(() => deserializeInkwellFile(json)).toThrow('Unsupported .inkwell version: 2');
    });

    it('should throw on missing metadata', () => {
      const json = JSON.stringify({ version: 1, content: {} });
      expect(() => deserializeInkwellFile(json)).toThrow('missing metadata');
    });

    it('should throw on missing metadata.title', () => {
      const json = JSON.stringify({
        version: 1,
        metadata: { tags: [] },
        content: {},
      });
      expect(() => deserializeInkwellFile(json)).toThrow('metadata.title must be a string');
    });

    it('should throw on missing content', () => {
      const json = JSON.stringify({
        version: 1,
        metadata: { title: 'X' },
      });
      expect(() => deserializeInkwellFile(json)).toThrow('missing or invalid content');
    });

    it('should handle missing optional metadata fields gracefully', () => {
      const json = JSON.stringify({
        version: 1,
        metadata: { title: 'Minimal' },
        content: { type: 'doc' },
      });
      const result = deserializeInkwellFile(json);
      expect(result.metadata.tags).toEqual([]);
      expect(result.metadata.wordCount).toBe(0);
      expect(result.metadata.createdAt).toBe('');
      expect(result.metadata.updatedAt).toBe('');
    });

    it('should filter non-string tags', () => {
      const json = JSON.stringify({
        version: 1,
        metadata: { title: 'T', tags: ['valid', 123, null, 'also-valid'] },
        content: { type: 'doc' },
      });
      const result = deserializeInkwellFile(json);
      expect(result.metadata.tags).toEqual(['valid', 'also-valid']);
    });
  });
});
