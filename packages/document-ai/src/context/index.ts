/**
 * Context Manager
 *
 * Assembles the document context window sent with each AI request.
 * Combines a stable prefix (system prompt + style + outline) with a
 * volatile suffix (cursor-relative sliding window) to build a
 * DocumentContext suitable for prompt caching.
 *
 * When a WorkspaceRetriever is provided, includes cross-document
 * snippets from related workspace files.
 */
import type { DocumentContext, WorkspaceRetriever } from '@inkwell/shared';
import { WORKSPACE_SNIPPET_RATIO } from '@inkwell/shared';
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
  private workspaceRetriever?: WorkspaceRetriever;

  constructor(options?: {
    prefixCache?: PrefixCache;
    windowTokens?: number;
    workspaceRetriever?: WorkspaceRetriever;
  }) {
    this.prefixCache = options?.prefixCache ?? new PrefixCache();
    this.windowTokens = options?.windowTokens ?? DEFAULT_WINDOW_TOKENS;
    this.workspaceRetriever = options?.workspaceRetriever;
  }

  /**
   * Build the full context for an AI request.
   *
   * @param docContent - The full document text
   * @param cursorPos - The cursor position within the document
   * @param docId - Optional document identifier for cache keying (defaults to 'default')
    * @param tokenBudget - Optional total token budget for workspace snippet allocation
   */
  async build(
    docContent: string,
    cursorPos: number,
    docId: string = 'default',
    tokenBudget?: number,
  ): Promise<DocumentContext> {
    const contentHash = djb2Hash(docContent);

    // 1. Build stable prefix (using cache)
    const stablePrefix = this.prefixCache.getPrefix(docId, contentHash, () =>
      this.computeStablePrefix(docContent),
    );

    // 2. Build volatile suffix from sliding window around cursor
    const window = slidingWindow(docContent, cursorPos, this.windowTokens);
    const volatileSuffix = window.before + window.after;

    // 3. Retrieve workspace snippets (if retriever available and budget given)
    let workspaceSnippets = '';
    if (this.workspaceRetriever && tokenBudget) {
      const prefixTokens = Math.ceil(stablePrefix.length / CHARS_PER_TOKEN);
      const windowTokens = Math.ceil(volatileSuffix.length / CHARS_PER_TOKEN);
      const remainingTokens = Math.max(0, tokenBudget - prefixTokens - windowTokens);
      const snippetBudget = Math.floor(
        remainingTokens * WORKSPACE_SNIPPET_RATIO,
      );

      if (snippetBudget > 0) {
        // Use a small window around cursor as search query
        const queryChars = 50 * CHARS_PER_TOKEN; // ~50 tokens
        const queryStart = Math.max(0, cursorPos - Math.floor(queryChars / 2));
        const queryEnd = Math.min(docContent.length, cursorPos + Math.floor(queryChars / 2));
        const query = docContent.slice(queryStart, queryEnd);

        if (query.trim()) {
          const snippets = await this.workspaceRetriever.retrieve(query, snippetBudget);
          if (snippets.length > 0) {
            const parts = snippets.map(
              (s) => `--- ${s.path} (score: ${s.score.toFixed(2)}) ---\n${s.content}`,
            );
            workspaceSnippets = '[Workspace Context]\n' + parts.join('\n');
          }
        }
      }
    }

    // 4. Compute token count (approximate: ~4 chars per token)
    const totalChars =
      stablePrefix.length + volatileSuffix.length + workspaceSnippets.length;
    const tokenCount = Math.ceil(totalChars / CHARS_PER_TOKEN);

    // 5. Compute cache key from stable prefix
    const cacheKey = djb2Hash(stablePrefix);

    return {
      stablePrefix,
      volatileSuffix,
      workspaceSnippets,
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
