import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorStore } from '../vector-store';

describe('VectorStore', () => {
  let store: VectorStore;

  beforeEach(() => {
    store = new VectorStore();
  });

  afterEach(() => {
    store.close();
  });

  it('should initialize with :memory: database', async () => {
    await store.initialize(':memory:');
    expect(store.isInitialized).toBe(true);
  });

  it('should create required tables on initialize', async () => {
    await store.initialize(':memory:');

    // Verify the chunks table exists by inserting and reading back
    await store.insert('test-chunk', [0.1, 0.2, 0.3], { path: 'test.md' });
    const results = await store.search([0.1, 0.2, 0.3], 10);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('test-chunk');
  });

  it('should be idempotent on multiple initializations', async () => {
    await store.initialize(':memory:');
    await store.insert('chunk-1', [0.1, 0.2], { path: 'a.md' });

    // Calling initialize again should not throw or lose data
    await store.initialize(':memory:');
    expect(store.isInitialized).toBe(true);
  });

  it('should insert vector with metadata', async () => {
    await store.initialize(':memory:');

    const metadata = { path: 'docs/readme.md', offset: 0, length: 100 };
    await store.insert('chunk-abc', [0.5, 0.6, 0.7], metadata);

    const results = await store.search([0.5, 0.6, 0.7], 10);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('chunk-abc');
    expect(results[0].metadata).toEqual(metadata);
  });

  it('should reject operations before initialize', async () => {
    await expect(
      store.insert('chunk-1', [0.1], { path: 'test.md' }),
    ).rejects.toThrow('not initialized');

    await expect(store.search([0.1], 5)).rejects.toThrow('not initialized');
  });

  it('should search and return results', async () => {
    await store.initialize(':memory:');

    await store.insert('c1', [1.0, 0.0, 0.0], { path: 'a.md' });
    await store.insert('c2', [0.0, 1.0, 0.0], { path: 'b.md' });
    await store.insert('c3', [0.0, 0.0, 1.0], { path: 'c.md' });

    const results = await store.search([1.0, 0.0, 0.0], 10);
    expect(results.length).toBe(3);

    // All inserted chunks should be present in results
    const ids = results.map((r) => r.id);
    expect(ids).toContain('c1');
    expect(ids).toContain('c2');
    expect(ids).toContain('c3');
  });

  it('should respect search limit', async () => {
    await store.initialize(':memory:');

    // Insert 5 chunks
    for (let i = 0; i < 5; i++) {
      await store.insert(`chunk-${i}`, [i * 0.1, 0.5, 0.5], {
        path: `file-${i}.md`,
      });
    }

    // Request only 2 results
    const results = await store.search([0.5, 0.5, 0.5], 2);
    expect(results.length).toBe(2);
  });

  it('should return empty results for no matches', async () => {
    await store.initialize(':memory:');

    // No data inserted — search should return empty
    const results = await store.search([0.1, 0.2, 0.3], 10);
    expect(results).toEqual([]);
  });

  it('should return results with correct shape', async () => {
    await store.initialize(':memory:');

    const metadata = { path: 'example.ts', offset: 42, length: 256 };
    await store.insert('shaped-chunk', [0.1, 0.2, 0.3], metadata);

    const results = await store.search([0.1, 0.2, 0.3], 10);
    expect(results.length).toBe(1);

    const result = results[0];

    // Verify the result has all expected properties
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('metadata');
    expect(result).toHaveProperty('distance');

    // Verify types
    expect(typeof result.id).toBe('string');
    expect(result.id).toBe('shaped-chunk');
    expect(result.metadata).toEqual(metadata);

    // distance is either a number (vec available) or null (fallback)
    expect(result.distance === null || typeof result.distance === 'number').toBe(
      true,
    );
  });
});
