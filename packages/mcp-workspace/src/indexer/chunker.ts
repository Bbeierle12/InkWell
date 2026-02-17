/**
 * Document Chunker
 *
 * Splits documents into chunks suitable for embedding and retrieval.
 */

import { randomUUID } from 'node:crypto';

export interface Chunk {
  id: string;
  content: string;
  metadata: { path: string; offset: number; length: number };
}

/**
 * Split a document into overlapping chunks.
 *
 * Uses a sliding window approach where each chunk overlaps with its neighbors
 * by `overlap` characters, enabling better context preservation during retrieval.
 *
 * @param content  - The full document text to chunk.
 * @param path     - File path used in chunk metadata.
 * @param chunkSize - Maximum characters per chunk (default 500).
 * @param overlap  - Characters of overlap between adjacent chunks (default 50).
 * @returns An array of Chunk objects covering the entire document.
 */
export function chunkDocument(
  content: string,
  path: string,
  chunkSize: number = 500,
  overlap: number = 50,
): Chunk[] {
  if (content.length === 0) {
    return [];
  }

  const step = chunkSize - overlap;
  if (step <= 0) {
    throw new Error('overlap must be smaller than chunkSize');
  }
  const chunks: Chunk[] = [];
  let offset = 0;

  while (offset < content.length) {
    const end = Math.min(offset + chunkSize, content.length);
    const slice = content.slice(offset, end);

    chunks.push({
      id: randomUUID(),
      content: slice,
      metadata: {
        path,
        offset,
        length: slice.length,
      },
    });

    // If this chunk reached the end of content, we're done.
    if (end === content.length) {
      break;
    }

    offset += step;
  }

  return chunks;
}
