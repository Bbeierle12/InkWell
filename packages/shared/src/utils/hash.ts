/**
 * Content hashing utilities for deduplication.
 */

/**
 * Compute a simple hash of the given string content.
 * Used for deduplicating queued AI requests.
 */
export async function contentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
