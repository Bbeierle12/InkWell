/**
 * Workspace Indexer
 *
 * Orchestrates FileWatcher + chunker + embed + VectorStore to provide
 * cross-document retrieval via the WorkspaceRetriever interface.
 */

import { readFile } from 'fs/promises';
import type { WorkspaceRetriever, WorkspaceSnippet } from '@inkwell/shared';
import { VectorStore } from './vector-store';
import { FileWatcher } from './file-watcher';
import { chunkDocument } from './chunker';
import { simpleEmbed } from './embed';

/** Approximate characters per token for budget estimation. */
const CHARS_PER_TOKEN = 4;

export class WorkspaceIndexer implements WorkspaceRetriever {
  private store: VectorStore;
  private watcher: FileWatcher;
  private initialized = false;

  constructor(options?: { store?: VectorStore; watcher?: FileWatcher }) {
    this.store = options?.store ?? new VectorStore();
    this.watcher = options?.watcher ?? new FileWatcher();
  }

  /**
   * Initialize the indexer: set up the vector store and optionally
   * start watching directories for file changes.
   */
  async initialize(dbPath: string, watchDirs?: string[]): Promise<void> {
    await this.store.initialize(dbPath);
    this.initialized = true;

    if (watchDirs) {
      for (const dir of watchDirs) {
        this.watcher.watch(dir, (path) => this.onFileChange(path));
      }
    }
  }

  /**
   * Index a document by chunking, embedding, and storing its content.
   */
  async indexDocument(path: string, content: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('WorkspaceIndexer is not initialized. Call initialize() first.');
    }

    const chunks = chunkDocument(content, path);
    for (const chunk of chunks) {
      const vector = simpleEmbed(chunk.content);
      await this.store.insert(chunk.id, vector, chunk.metadata, chunk.content);
    }
  }

  /**
   * Retrieve workspace snippets relevant to a query, respecting a token budget.
   *
   * Searches the vector store, iterates results sorted by relevance,
   * and accumulates snippets until the token budget is exhausted.
   */
  async retrieve(query: string, maxTokens: number): Promise<WorkspaceSnippet[]> {
    if (!this.initialized || !query.trim() || maxTokens <= 0) {
      return [];
    }

    const queryVector = simpleEmbed(query);
    const results = await this.store.search(queryVector, 10);

    const snippets: WorkspaceSnippet[] = [];
    let usedTokens = 0;

    for (const result of results) {
      const content = result.content;
      if (!content) continue;

      const contentTokens = Math.ceil(content.length / CHARS_PER_TOKEN);
      if (usedTokens + contentTokens > maxTokens) {
        // If we haven't added anything yet and this chunk is too big,
        // truncate it to fit the budget
        if (snippets.length === 0) {
          const maxChars = maxTokens * CHARS_PER_TOKEN;
          const truncated = content.slice(0, maxChars);
          const meta = result.metadata as { path: string };
          snippets.push({
            content: truncated,
            path: meta.path ?? '',
            score: result.distance != null ? 1 / (1 + result.distance) : 0,
          });
        }
        break;
      }

      const meta = result.metadata as { path: string };
      snippets.push({
        content,
        path: meta.path ?? '',
        score: result.distance != null ? 1 / (1 + result.distance) : 0,
      });
      usedTokens += contentTokens;
    }

    return snippets;
  }

  /**
   * Handle a file change event from the watcher.
   */
  private async onFileChange(path: string): Promise<void> {
    try {
      const content = await readFile(path, 'utf-8');
      await this.indexDocument(path, content);
    } catch {
      // File may have been deleted — ignore errors
    }
  }

  /**
   * Stop the watcher and close the vector store.
   */
  close(): void {
    this.watcher.stop();
    this.store.close();
    this.initialized = false;
  }
}
