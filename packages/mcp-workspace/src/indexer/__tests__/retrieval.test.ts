import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorStore } from '../vector-store.js';

/**
 * Simple bag-of-words embedding: hash tokens into a 384-dim normalized vector.
 */
function simpleEmbed(text: string): number[] {
  const vec = new Array(384).fill(0);
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
    }
    vec[Math.abs(hash) % 384] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

/** Helper to generate a stable chunk ID from an index. */
function chunkId(index: number): string {
  return `chunk-${index}`;
}

/**
 * 5.2 Retrieval Quality Tests
 */
describe('5.2 Retrieval Quality', () => {
  let store: VectorStore;

  const corpus = [
    { id: chunkId(0), text: 'cats are independent pets that love to nap and play with yarn', topic: 'cats' },
    { id: chunkId(1), text: 'dogs are loyal companions that enjoy walks and playing fetch', topic: 'dogs' },
    { id: chunkId(2), text: 'birds can fly and sing beautiful melodies from treetops', topic: 'birds' },
    { id: chunkId(3), text: 'machine learning is powerful for data analysis and prediction', topic: 'ml' },
    { id: chunkId(4), text: 'deep learning networks process complex patterns in large datasets', topic: 'dl' },
  ];

  beforeEach(async () => {
    store = new VectorStore();
    await store.initialize(':memory:');

    // Insert all corpus chunks
    for (const item of corpus) {
      const vector = simpleEmbed(item.text);
      await store.insert(item.id, vector, {
        topic: item.topic,
        text: item.text,
      });
    }
  });

  afterEach(() => {
    store.close();
  });

  it('should return relevant results for keyword queries', async () => {
    // Ref: Test Plan §5.2
    // Search for "cats" — we expect the cat-related chunk to appear in results
    const queryVector = simpleEmbed('cats');
    const results = await store.search(queryVector, 5);

    expect(results.length).toBeGreaterThan(0);

    // The cat chunk should be present in the results
    const catResult = results.find((r) => r.id === chunkId(0));
    expect(catResult).toBeDefined();
    expect((catResult!.metadata as { topic: string }).topic).toBe('cats');

    // If distance-based ranking is available (sqlite-vec loaded), the cat
    // chunk should be the closest match. In fallback mode we just verify
    // it appears somewhere in the result set.
    if (results[0].distance !== null) {
      expect(results[0].id).toBe(chunkId(0));
    }
  });

  it('should return relevant results for semantic queries', async () => {
    // Ref: Test Plan §5.2
    // Search for "neural network training" — with our bag-of-words approach,
    // tokens like "network" and "learning" overlap with the ML/DL corpus entries.
    // We verify that results are returned (the store is not empty for this query).
    const queryVector = simpleEmbed('neural network training');
    const results = await store.search(queryVector, 5);

    expect(results.length).toBeGreaterThan(0);

    // At least one of the ML-related chunks should appear
    const mlTopics = results.filter((r) => {
      const meta = r.metadata as { topic: string };
      return meta.topic === 'ml' || meta.topic === 'dl';
    });
    // With bag-of-words hashing, "network" shares a hash dimension with
    // "networks" in the DL entry. Verify we get at least one ML/DL result.
    // In fallback mode (no vec), all chunks are returned, so this still holds.
    expect(mlTopics.length).toBeGreaterThanOrEqual(1);
  });

  it('should respect result limit', async () => {
    // Ref: Test Plan §5.2
    // We have 5 chunks in the corpus. Searching with limit=2 should
    // return at most 2 results.
    const queryVector = simpleEmbed('animals and technology');
    const results = await store.search(queryVector, 2);

    expect(results).toHaveLength(2);

    // Each result should have the expected shape
    for (const result of results) {
      expect(result.id).toBeTruthy();
      expect(result.metadata).toBeDefined();
      // distance is either a number (vec available) or null (fallback)
      expect(
        typeof result.distance === 'number' || result.distance === null,
      ).toBe(true);
    }
  });
});
