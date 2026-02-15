/**
 * Simple Embedding
 *
 * Bag-of-words hash embedding for workspace vector search.
 * Creates a 384-dimensional L2-normalized vector from text.
 */

/**
 * Create a simple 384-dimensional embedding from text using
 * a bag-of-words hash approach.
 *
 * Tokens are lowercased, hashed via djb2, and accumulated into
 * a fixed-size vector which is then L2-normalized.
 */
export function simpleEmbed(text: string): number[] {
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
