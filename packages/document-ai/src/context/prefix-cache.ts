/**
 * Prefix Cache
 *
 * Maintains a stable prefix for Claude prompt caching.
 * Uses a simple Map-based cache keyed by document ID.
 */

export class PrefixCache {
  private cache: Map<string, { contentHash: string; prefix: string }> = new Map();

  /**
   * Get or compute the stable prefix for a document.
   *
   * Returns the cached prefix if one exists for the given docId.
   * Otherwise, calls computeFn to generate the prefix, caches it,
   * and returns the result.
   */
  getPrefix(
    docId: string,
    contentHashOrComputeFn: string | (() => string),
    maybeComputeFn?: () => string,
  ): string {
    const isLegacyCall = typeof contentHashOrComputeFn === 'function';
    const contentHash =
      typeof contentHashOrComputeFn === 'string' ? contentHashOrComputeFn : '';
    const computeFn =
      typeof contentHashOrComputeFn === 'function'
        ? contentHashOrComputeFn
        : maybeComputeFn;

    if (!computeFn) {
      throw new Error('PrefixCache.getPrefix requires a compute function');
    }

    const cached = this.cache.get(docId);
    if (
      cached !== undefined &&
      (isLegacyCall || cached.contentHash === contentHash || cached.contentHash === '')
    ) {
      return cached.prefix;
    }

    const prefix = computeFn();
    this.cache.set(docId, { contentHash, prefix });
    return prefix;
  }

  /**
   * Invalidate the cached prefix for a document.
   */
  invalidate(docId: string): void {
    this.cache.delete(docId);
  }
}
