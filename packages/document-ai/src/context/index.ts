/**
 * Context Manager
 *
 * Assembles the document context window sent with each AI request.
 * Combines a stable prefix (system prompt + style + outline) with a
 * volatile suffix (cursor-relative sliding window) to build a
 * DocumentContext suitable for prompt caching.
 */
import type { DocumentContext } from '@inkwell/shared';
import { PrefixCache } from './prefix-cache';
import { analyzeStyle } from './style-profile';
import { slidingWindow } from './sliding-window';

export type { StyleProfile } from './style-profile';
export { PrefixCache } from './prefix-cache';
export { analyzeStyle } from './style-profile';
export { slidingWindow } from './sliding-window';

/** Approximate characters per token for estimation. */
const CHARS_PER_TOKEN = 4;

/** Default token budget for the sliding window context. */
const DEFAULT_WINDOW_TOKENS = 500;

/** System prompt included in every stable prefix. */
const SYSTEM_PROMPT =
  'You are InkWell AI, a writing assistant embedded in a word processor. ' +
  'Help the user write, edit, and refine their document while matching ' +
  'their established style and voice.';

/**
 * Simple synchronous string hash (djb2 algorithm).
 * Used for cache key generation since contentHash from @inkwell/shared is async.
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + charCode
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Extract a document outline from content.
 *
 * Looks for markdown-style headers (lines starting with #) or
 * falls back to the first N characters of the document.
 */
function extractOutline(content: string, maxChars: number = 500): string {
  const lines = content.split('\n');
  const headers = lines.filter((line) => /^#{1,6}\s/.test(line.trim()));

  if (headers.length > 0) {
    const outline = headers.join('\n');
    return outline.length > maxChars ? outline.slice(0, maxChars) : outline;
  }

  // Fallback: use first N characters as document summary
  const trimmed = content.trim();
  return trimmed.length > maxChars ? trimmed.slice(0, maxChars) : trimmed;
}

export class ContextManager {
  private prefixCache: PrefixCache;
  private windowTokens: number;

  constructor(options?: { prefixCache?: PrefixCache; windowTokens?: number }) {
    this.prefixCache = options?.prefixCache ?? new PrefixCache();
    this.windowTokens = options?.windowTokens ?? DEFAULT_WINDOW_TOKENS;
  }

  /**
   * Build the full context for an AI request.
   *
   * @param docContent - The full document text
   * @param cursorPos - The cursor position within the document
   * @param docId - Optional document identifier for cache keying (defaults to 'default')
   */
  build(docContent: string, cursorPos: number, docId: string = 'default'): DocumentContext {
    // 1. Build stable prefix (using cache)
    const stablePrefix = this.prefixCache.getPrefix(docId, () =>
      this.computeStablePrefix(docContent),
    );

    // 2. Build volatile suffix from sliding window around cursor
    const window = slidingWindow(docContent, cursorPos, this.windowTokens);
    const volatileSuffix = window.before + window.after;

    // 3. Compute token count (approximate: ~4 chars per token)
    const totalChars = stablePrefix.length + volatileSuffix.length;
    const tokenCount = Math.ceil(totalChars / CHARS_PER_TOKEN);

    // 4. Compute cache key from stable prefix
    const cacheKey = djb2Hash(stablePrefix);

    return {
      stablePrefix,
      volatileSuffix,
      tokenCount,
      cacheKey,
    };
  }

  /**
   * Invalidate the cached prefix for a document, forcing recomputation
   * on the next build() call.
   */
  invalidatePrefix(docId: string = 'default'): void {
    this.prefixCache.invalidate(docId);
  }

  /**
   * Compute the stable prefix from system prompt, style profile, and outline.
   */
  private computeStablePrefix(docContent: string): string {
    const parts: string[] = [];

    // System prompt
    parts.push(SYSTEM_PROMPT);

    // Style profile summary
    const style = analyzeStyle(docContent);
    parts.push(
      `[Style: tone=${style.tone}, formality=${style.formality}, ` +
      `sentences=${style.sentenceLength}, vocabulary=${style.vocabulary}]`,
    );

    // Document outline
    const outline = extractOutline(docContent);
    if (outline) {
      parts.push(`[Outline]\n${outline}`);
    }

    return parts.join('\n\n');
  }
}
