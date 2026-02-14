/**
 * Prefix Cache
 *
 * Maintains a stable prefix for Claude prompt caching.
 * Uses a simple Map-based cache keyed by document ID.
 */

export class PrefixCache {
  private cache: Map<string, string> = new Map();

  /**
   * Get or compute the stable prefix for a document.
   *
   * Returns the cached prefix if one exists for the given docId.
   * Otherwise, calls computeFn to generate the prefix, caches it,
   * and returns the result.
   */
  getPrefix(docId: string, computeFn: () => string): string {
    const cached = this.cache.get(docId);
    if (cached !== undefined) {
      return cached;
    }

    const prefix = computeFn();
    this.cache.set(docId, prefix);
    return prefix;
  }

  /**
   * Invalidate the cached prefix for a document.
   */
  invalidate(docId: string): void {
    this.cache.delete(docId);
  }
}
