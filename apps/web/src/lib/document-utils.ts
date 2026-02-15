/**
 * Document Utilities
 *
 * Helper functions for document store operations:
 * content preview extraction, relative time formatting, word counting.
 */

/**
 * Extract a plain-text preview from TipTap JSON content.
 * Walks the node tree collecting text nodes, then truncates.
 */
export function extractPreview(content: Record<string, unknown>, maxLength: number = 80): string {
  const parts: string[] = [];

  function walk(node: Record<string, unknown>) {
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child as Record<string, unknown>);
      }
    }
  }

  walk(content);
  const joined = parts.join(' ');
  if (joined.length <= maxLength) return joined;
  return joined.slice(0, maxLength) + '...';
}

/**
 * Format a timestamp as a relative time string (e.g., "5 min ago").
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  return `${diffWeeks} wk ago`;
}

/**
 * Count words in a plain text string.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Count words from TipTap JSON content.
 */
export function countWordsFromContent(content: Record<string, unknown>): number {
  const text = extractPreview(content, Infinity);
  return countWords(text);
}

/**
 * Assign a stable color to a tag name.
 * Uses a hash to pick from a predefined palette.
 */
const TAG_PALETTE = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

/**
 * Derive a title from TipTap JSON content.
 * Returns the first heading text, or the first line of text, or null.
 */
export function deriveTitleFromContent(content: Record<string, unknown>): string | null {
  if (!content || !Array.isArray(content.content)) return null;

  for (const node of content.content as Record<string, unknown>[]) {
    // Prefer headings
    if (node.type === 'heading' && Array.isArray(node.content)) {
      const text = (node.content as Record<string, unknown>[])
        .filter((n) => n.type === 'text' && typeof n.text === 'string')
        .map((n) => n.text as string)
        .join('');
      if (text.trim()) return text.trim();
    }
  }

  // Fall back to first paragraph text
  for (const node of content.content as Record<string, unknown>[]) {
    if (node.type === 'paragraph' && Array.isArray(node.content)) {
      const text = (node.content as Record<string, unknown>[])
        .filter((n) => n.type === 'text' && typeof n.text === 'string')
        .map((n) => n.text as string)
        .join('');
      if (text.trim()) {
        const firstLine = text.trim().slice(0, 60);
        return firstLine;
      }
    }
  }

  return null;
}
