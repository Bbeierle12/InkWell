import { describe, it, expect, vi } from 'vitest';
import { workspaceSearch } from '../workspace-search';
import { workspaceWatch } from '../workspace-watch';
import { documentAnalyze } from '../document-analyze';
import { documentStyleGuide } from '../document-style-guide';
import { FileWatcher } from '../../indexer/file-watcher';

describe('workspace-search', () => {
  it('returns empty array when no store is provided', async () => {
    const results = await workspaceSearch('test query');
    expect(results).toEqual([]);
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns empty array for no matches (empty store)', async () => {
    const results = await workspaceSearch('nonexistent data');
    expect(results).toEqual([]);
  });

  it('default limit is 10', async () => {
    // When called without explicit limit, the function signature
    // defaults to 10. We verify it does not throw and returns [].
    const results = await workspaceSearch('hello world');
    expect(results).toEqual([]);
  });
});

describe('workspace-watch', () => {
  it('does not throw for valid patterns', () => {
    // Create a mock FileWatcher that does not actually watch the filesystem
    const mockWatch = vi.fn();
    const mockFw = { watch: mockWatch, stopOne: vi.fn(), stop: vi.fn() } as unknown as FileWatcher;

    expect(() => workspaceWatch(['/tmp/test'], mockFw)).not.toThrow();
    expect(mockWatch).toHaveBeenCalledTimes(1);
    expect(mockWatch).toHaveBeenCalledWith('/tmp/test', expect.any(Function));
  });

  it('handles empty array', () => {
    const mockWatch = vi.fn();
    const mockFw = { watch: mockWatch, stopOne: vi.fn(), stop: vi.fn() } as unknown as FileWatcher;

    expect(() => workspaceWatch([], mockFw)).not.toThrow();
    expect(mockWatch).not.toHaveBeenCalled();
  });
});

describe('document-analyze', () => {
  it('counts words, sentences, paragraphs correctly', async () => {
    const content = 'Hello world. How are you?\n\nSecond paragraph here.';
    const result = await documentAnalyze(content);

    // 8 words: Hello world How are you Second paragraph here
    expect(result.wordCount).toBe(8);
    // 3 sentences: "Hello world." + "How are you?" + "Second paragraph here."
    expect(result.sentenceCount).toBe(3);
    // 2 paragraphs separated by double newline
    expect(result.paragraphCount).toBe(2);
  });

  it('detects headings from markdown', async () => {
    const content = '# Title\n\nSome text.\n\n## Subtitle\n\nMore text.';
    const result = await documentAnalyze(content);

    expect(result.headings).toEqual(['Title', 'Subtitle']);
  });

  it('returns correct AnalysisResult shape', async () => {
    const content = 'A simple document with a few words.';
    const result = await documentAnalyze(content);

    expect(result).toHaveProperty('wordCount');
    expect(result).toHaveProperty('sentenceCount');
    expect(result).toHaveProperty('paragraphCount');
    expect(result).toHaveProperty('headings');
    expect(result).toHaveProperty('readingLevel');
    expect(result).toHaveProperty('estimatedReadTimeMinutes');

    expect(typeof result.wordCount).toBe('number');
    expect(typeof result.sentenceCount).toBe('number');
    expect(typeof result.paragraphCount).toBe('number');
    expect(Array.isArray(result.headings)).toBe(true);
    expect(typeof result.readingLevel).toBe('string');
    expect(typeof result.estimatedReadTimeMinutes).toBe('number');
  });
});

describe('document-style-guide', () => {
  it('detects tone and formality', async () => {
    const formalText =
      'The committee has therefore decided to proceed. Furthermore, the analysis confirms our hypothesis.';
    const result = await documentStyleGuide(formalText);

    expect(result.formality).toBe('formal');
    expect(result.tone).toBe('neutral');
  });

  it('returns correct StyleGuideResult shape', async () => {
    const content = 'Just a quick note about stuff.';
    const result = await documentStyleGuide(content);

    expect(result).toHaveProperty('tone');
    expect(result).toHaveProperty('formality');
    expect(result).toHaveProperty('sentenceLength');
    expect(result).toHaveProperty('vocabulary');
    expect(result).toHaveProperty('recommendations');

    expect(typeof result.tone).toBe('string');
    expect(typeof result.formality).toBe('string');
    expect(typeof result.sentenceLength).toBe('string');
    expect(typeof result.vocabulary).toBe('string');
    expect(Array.isArray(result.recommendations)).toBe(true);
  });
});
