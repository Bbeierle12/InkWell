import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkspaceIndexer } from '../indexer/workspace-indexer';
import { VectorStore } from '../indexer/vector-store';
import { FileWatcher } from '../indexer/file-watcher';

/**
 * 8.1 WorkspaceIndexer Tests
 *
 * Tests for the orchestrator that wires FileWatcher + chunker + embed + VectorStore
 * and implements WorkspaceRetriever.
 */
describe('8.1 WorkspaceIndexer', () => {
  let store: VectorStore;
  let watcher: FileWatcher;
  let indexer: WorkspaceIndexer;

  beforeEach(async () => {
    store = new VectorStore();
    // Mock watcher to avoid real filesystem access
    watcher = new FileWatcher({ watch: vi.fn() as unknown as typeof import('fs').watch });
    indexer = new WorkspaceIndexer({ store, watcher });
    await indexer.initialize(':memory:');
  });

  afterEach(() => {
    indexer.close();
  });

  it('should index document and store chunks in vector store', async () => {
    const content = 'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.';
    await indexer.indexDocument('docs/typescript.md', content);

    // Verify we can retrieve something related to what we indexed
    const snippets = await indexer.retrieve('TypeScript JavaScript', 1000);
    expect(snippets.length).toBeGreaterThan(0);
    expect(snippets[0].path).toBe('docs/typescript.md');
    expect(snippets[0].content).toContain('TypeScript');
  });

  it('should return relevant snippets sorted by score', async () => {
    await indexer.indexDocument('docs/cats.md', 'Cats are independent pets that love to nap and play with yarn.');
    await indexer.indexDocument('docs/dogs.md', 'Dogs are loyal companions that enjoy walks and playing fetch.');
    await indexer.indexDocument('docs/ml.md', 'Machine learning is powerful for data analysis and prediction.');

    const snippets = await indexer.retrieve('cats pets yarn', 5000);
    expect(snippets.length).toBeGreaterThan(0);

    // The cat document should be in the results
    const catSnippet = snippets.find((s) => s.path === 'docs/cats.md');
    expect(catSnippet).toBeDefined();
    expect(catSnippet!.content).toContain('Cats');
  });

  it('should respect token budget and truncate results', async () => {
    // Index a large document
    const longContent = 'word '.repeat(500); // ~2500 chars = ~625 tokens
    await indexer.indexDocument('docs/long.md', longContent);

    // Request only 10 tokens budget (~40 chars)
    const snippets = await indexer.retrieve('word', 10);

    if (snippets.length > 0) {
      const totalChars = snippets.reduce((sum, s) => sum + s.content.length, 0);
      // Should be within budget: 10 tokens * 4 chars/token = 40 chars max
      expect(totalChars).toBeLessThanOrEqual(40);
    }
  });

  it('should return empty array for empty query', async () => {
    await indexer.indexDocument('docs/test.md', 'Some content here.');

    const snippets = await indexer.retrieve('', 1000);
    expect(snippets).toEqual([]);
  });

  it('should return empty array for zero token budget', async () => {
    await indexer.indexDocument('docs/test.md', 'Some content here.');

    const snippets = await indexer.retrieve('content', 0);
    expect(snippets).toEqual([]);
  });

  it('should return empty array when no documents indexed', async () => {
    const snippets = await indexer.retrieve('anything', 1000);
    expect(snippets).toEqual([]);
  });

  it('should throw when indexing before initialization', async () => {
    const uninitializedIndexer = new WorkspaceIndexer({ store: new VectorStore(), watcher });

    await expect(
      uninitializedIndexer.indexDocument('test.md', 'content'),
    ).rejects.toThrow(/not initialized/);
  });

  it('should close store and watcher on close()', async () => {
    const stopSpy = vi.spyOn(watcher, 'stop');
    const closeSpy = vi.spyOn(store, 'close');

    indexer.close();

    expect(stopSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });
});
