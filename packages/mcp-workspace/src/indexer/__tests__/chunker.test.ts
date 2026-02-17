import { describe, it, expect } from 'vitest';
import { chunkDocument } from '../chunker';

describe('chunker', () => {
  it('should split content into chunks of specified size', () => {
    const content = 'a'.repeat(100);
    const chunks = chunkDocument(content, 'test.txt', 30, 10);

    // Every chunk except possibly the last should be exactly chunkSize
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i].content.length).toBe(30);
    }
    // Last chunk can be <= chunkSize
    expect(chunks[chunks.length - 1].content.length).toBeLessThanOrEqual(30);
    expect(chunks[chunks.length - 1].content.length).toBeGreaterThan(0);
  });

  it('should have overlapping content between adjacent chunks', () => {
    // Use distinguishable content so overlaps are verifiable
    const content = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const chunkSize = 10;
    const overlap = 4;
    const chunks = chunkDocument(content, 'overlap.txt', chunkSize, overlap);

    for (let i = 0; i < chunks.length - 1; i++) {
      const currentTail = chunks[i].content.slice(-overlap);
      const nextHead = chunks[i + 1].content.slice(0, overlap);
      expect(currentTail).toBe(nextHead);
    }
  });

  it('should use default ~500 chars chunk size and ~50 overlap', () => {
    // 1000 chars with defaults (chunkSize=500, overlap=50, step=450)
    // Expected chunks: offset 0..499, 450..949, 900..999
    const content = 'x'.repeat(1000);
    const chunks = chunkDocument(content, 'defaults.txt');

    expect(chunks.length).toBe(3);
    expect(chunks[0].content.length).toBe(500);
    expect(chunks[0].metadata.offset).toBe(0);
    expect(chunks[1].metadata.offset).toBe(450);
    expect(chunks[2].metadata.offset).toBe(900);
  });

  it('should include correct metadata (path, offset, length)', () => {
    const content = 'Hello, world! This is a test document for chunking.';
    const path = 'docs/readme.md';
    const chunks = chunkDocument(content, path, 20, 5);

    for (const chunk of chunks) {
      expect(chunk.metadata.path).toBe(path);
      expect(chunk.metadata.length).toBe(chunk.content.length);
      // The chunk content should match the source at the recorded offset
      expect(content.slice(chunk.metadata.offset, chunk.metadata.offset + chunk.metadata.length))
        .toBe(chunk.content);
    }
  });

  it('should generate unique chunk IDs', () => {
    const content = 'a'.repeat(2000);
    const chunks = chunkDocument(content, 'ids.txt', 100, 10);

    const ids = chunks.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    // Each ID should be a valid UUID v4 format
    for (const id of ids) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
  });

  it('should return single chunk for small content', () => {
    const content = 'Short text.';
    const chunks = chunkDocument(content, 'small.txt', 500, 50);

    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe(content);
    expect(chunks[0].metadata.offset).toBe(0);
    expect(chunks[0].metadata.length).toBe(content.length);
    expect(chunks[0].metadata.path).toBe('small.txt');
  });

  it('should return empty array for empty content', () => {
    const chunks = chunkDocument('', 'empty.txt');
    expect(chunks).toEqual([]);
  });

  it('should handle exact boundary content', () => {
    // Content length is exactly chunkSize -> single chunk
    const content = 'b'.repeat(100);
    const chunks = chunkDocument(content, 'exact.txt', 100, 20);

    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe(content);
    expect(chunks[0].metadata.length).toBe(100);

    // Content length is exactly 2*chunkSize - overlap (i.e. exactly 2 full chunks)
    // chunkSize=100, overlap=20, step=80 -> 2 chunks: [0..99], [80..179]
    const content2 = 'c'.repeat(180);
    const chunks2 = chunkDocument(content2, 'exact2.txt', 100, 20);

    expect(chunks2.length).toBe(2);
    expect(chunks2[0].content.length).toBe(100);
    expect(chunks2[1].content.length).toBe(100);
    expect(chunks2[0].metadata.offset).toBe(0);
    expect(chunks2[1].metadata.offset).toBe(80);

    // Verify full coverage: first chunk start to last chunk end covers all content
    const lastChunk = chunks2[chunks2.length - 1];
    expect(lastChunk.metadata.offset + lastChunk.metadata.length).toBe(content2.length);
  });

  it('should reject overlap greater than or equal to chunk size', () => {
    expect(() => chunkDocument('hello world', 'bad.txt', 10, 10)).toThrow(
      /overlap must be smaller than chunkSize/,
    );
    expect(() => chunkDocument('hello world', 'bad.txt', 10, 12)).toThrow(
      /overlap must be smaller than chunkSize/,
    );
  });
});
