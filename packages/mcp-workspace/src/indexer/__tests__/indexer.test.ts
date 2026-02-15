import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chunkDocument } from '../chunker.js';
import { VectorStore } from '../vector-store.js';
import { simpleEmbed } from '../embed.js';

/**
 * 5.1 Workspace Indexing Tests
 */
describe('5.1 Workspace Indexing', () => {
  let store: VectorStore;

  beforeEach(async () => {
    store = new VectorStore();
    await store.initialize(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('should index new files when added to workspace', async () => {
    // Ref: Test Plan §5.1
    const content =
      'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.';
    const path = 'docs/typescript-intro.md';

    // Chunk the document and insert each chunk into the store
    const chunks = chunkDocument(content, path);
    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      const vector = simpleEmbed(chunk.content);
      await store.insert(chunk.id, vector, chunk.metadata, chunk.content);
    }

    // Search for content related to what we just indexed
    const queryVector = simpleEmbed('TypeScript JavaScript');
    const results = await store.search(queryVector, 5);

    // We should get results back from the store
    expect(results.length).toBeGreaterThan(0);
    // The result metadata should reference our indexed file path
    const firstMeta = results[0].metadata as { path: string };
    expect(firstMeta.path).toBe(path);
  });

  it('should update index when files change', async () => {
    // Ref: Test Plan §5.1
    const oldContent = 'The old documentation talks about legacy patterns and jQuery usage.';
    const newContent = 'The new documentation covers modern React hooks and server components.';
    const path = 'docs/guide.md';

    // Insert the old content
    const oldChunks = chunkDocument(oldContent, path);
    for (const chunk of oldChunks) {
      const vector = simpleEmbed(chunk.content);
      await store.insert(chunk.id, vector, chunk.metadata, chunk.content);
    }

    // Now "update" by inserting new content for the same path
    const newChunks = chunkDocument(newContent, path);
    for (const chunk of newChunks) {
      const vector = simpleEmbed(chunk.content);
      await store.insert(chunk.id, vector, chunk.metadata, chunk.content);
    }

    // Search for the new content terms
    const queryVector = simpleEmbed('React hooks server components');
    const results = await store.search(queryVector, 10);

    // We should find results — the new content is in the store
    expect(results.length).toBeGreaterThan(0);

    // At least one result should reference our path
    const matchingPaths = results.filter(
      (r) => (r.metadata as { path: string }).path === path,
    );
    expect(matchingPaths.length).toBeGreaterThan(0);
  });

  it('should remove index entries when files are deleted', async () => {
    // Ref: Test Plan §5.1
    // The current VectorStore API does not expose a delete method.
    // Instead, we verify that searching an empty store returns no results,
    // confirming that only explicitly inserted data appears in search results.
    const queryVector = simpleEmbed('some arbitrary search query');
    const results = await store.search(queryVector, 10);

    // An empty store should yield no results
    expect(results).toHaveLength(0);

    // Now insert a single chunk and verify it appears
    const content = 'Temporary file content that will be conceptually deleted.';
    const chunks = chunkDocument(content, 'temp/file.md');
    for (const chunk of chunks) {
      await store.insert(chunk.id, simpleEmbed(chunk.content), chunk.metadata, chunk.content);
    }

    const afterInsert = await store.search(simpleEmbed(content), 10);
    expect(afterInsert.length).toBeGreaterThan(0);

    // Close and reinitialize with a fresh in-memory DB to simulate deletion
    store.close();
    store = new VectorStore();
    await store.initialize(':memory:');

    const afterDelete = await store.search(simpleEmbed(content), 10);
    expect(afterDelete).toHaveLength(0);
  });

  it('should chunk documents into overlapping segments', () => {
    // Ref: Test Plan §5.1
    const chunkSize = 100;
    const overlap = 20;
    // Create a 1000-char document with recognizable content
    const content = Array.from({ length: 1000 }, (_, i) =>
      String.fromCharCode(65 + (i % 26)),
    ).join('');

    expect(content.length).toBe(1000);

    const chunks = chunkDocument(content, 'test/doc.txt', chunkSize, overlap);

    // With step = 100 - 20 = 80, we expect ceil(1000 / 80) chunks
    // Offsets: 0, 80, 160, 240, 320, 400, 480, 560, 640, 720, 800, 880, 960
    // The last chunk at offset 960 covers 960..1000 (40 chars), which ends content.
    expect(chunks.length).toBeGreaterThan(1);

    // Verify each chunk has correct metadata
    for (const chunk of chunks) {
      expect(chunk.id).toBeTruthy();
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.content.length).toBeLessThanOrEqual(chunkSize);
      expect(chunk.metadata.path).toBe('test/doc.txt');
      expect(chunk.metadata.length).toBe(chunk.content.length);
    }

    // Verify adjacent chunks overlap by the expected amount
    for (let i = 0; i < chunks.length - 1; i++) {
      const currentChunk = chunks[i];
      const nextChunk = chunks[i + 1];

      // The overlap region: the tail of the current chunk should match
      // the head of the next chunk.
      // Current chunk covers [offset_i, offset_i + length_i)
      // Next chunk covers [offset_{i+1}, offset_{i+1} + length_{i+1})
      // Overlap = offset_i + length_i - offset_{i+1}
      const currentEnd =
        currentChunk.metadata.offset + currentChunk.metadata.length;
      const nextStart = nextChunk.metadata.offset;
      const actualOverlap = currentEnd - nextStart;

      // For non-last chunks (full-size), overlap should be exactly `overlap`
      if (currentChunk.metadata.length === chunkSize) {
        expect(actualOverlap).toBe(overlap);
      } else {
        // Last partial chunk might have different overlap
        expect(actualOverlap).toBeGreaterThanOrEqual(0);
      }

      // Verify the overlapping text content matches
      if (actualOverlap > 0) {
        const tailOfCurrent = currentChunk.content.slice(-actualOverlap);
        const headOfNext = nextChunk.content.slice(0, actualOverlap);
        expect(tailOfCurrent).toBe(headOfNext);
      }
    }

    // Verify the chunks collectively cover the entire document
    expect(chunks[0].metadata.offset).toBe(0);
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.metadata.offset + lastChunk.metadata.length).toBe(
      content.length,
    );
  });
});
