/**
 * Workspace Search Tool
 *
 * MCP tool that searches the workspace index for relevant documents.
 */

import type { SearchResult } from '@inkwell/shared';
import type { VectorStore } from '../indexer/vector-store';

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
    content: '',
    score: r.distance != null ? 1 / (1 + r.distance) : 0,
    metadata: r.metadata as { path: string; offset: number; length: number },
  }));
}

/**
 * Create a simple 384-dimensional embedding from text using
 * a bag-of-words hash approach.
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
  // Normalize
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}
