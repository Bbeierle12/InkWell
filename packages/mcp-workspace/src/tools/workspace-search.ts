/**
 * Workspace Search Tool
 *
 * MCP tool that searches the workspace index for relevant documents.
 */

import type { SearchResult } from '@inkwell/shared';
import type { VectorStore } from '../indexer/vector-store';
import { simpleEmbed } from '../indexer/embed';

/**
 * Search the workspace for documents matching a query.
 *
 * Uses a simple bag-of-words hash embedding to create a query vector,
 * then searches the vector store for nearest neighbours.
 *
 * @param query  Natural-language search query.
 * @param limit  Maximum results to return (default 10).
 * @param store  Optional VectorStore instance; returns [] when absent.
 */
export async function workspaceSearch(
  query: string,
  limit: number = 10,
  store?: VectorStore,
): Promise<SearchResult[]> {
  if (!store) return [];

  const queryVector = simpleEmbed(query);
  const results = await store.search(queryVector, limit);

  return results.map((r) => ({
    chunkId: r.id,
    content: r.content,
    score: r.distance != null ? 1 / (1 + r.distance) : 0,
    metadata: r.metadata as { path: string; offset: number; length: number },
  }));
}
