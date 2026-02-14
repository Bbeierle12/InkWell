/**
 * Token Budget Tracker
 *
 * Tracks per-minute token usage and enforces budget limits.
 * Uses a sliding window of 60 seconds.
 */
import { TOKEN_BUDGETS } from '@inkwell/shared';

interface UsageEntry {
  tokens: number;
  timestamp: number;
}

const WINDOW_MS = 60_000; // 60 seconds

export class TokenBudgetTracker {
  private usage: Map<string, UsageEntry[]> = new Map();

  /**
   * Remove entries older than 60 seconds from the given category.
   */
  private cleanup(category: string): void {
    const entries = this.usage.get(category);
    if (!entries) return;

    const cutoff = Date.now() - WINDOW_MS;
    const filtered = entries.filter((e) => e.timestamp > cutoff);

    if (filtered.length === 0) {
      this.usage.delete(category);
    } else {
      this.usage.set(category, filtered);
    }
  }

  /**
   * Sum the current token usage within the sliding window for a category.
   */
  private currentUsage(category: string): number {
    this.cleanup(category);
    const entries = this.usage.get(category);
    if (!entries) return 0;
    return entries.reduce((sum, e) => sum + e.tokens, 0);
  }

  /**
   * Check if the requested token count is within budget.
   * Ref: Invariant: queue-respects-token-budget
   */
  canSpend(category: keyof typeof TOKEN_BUDGETS, tokens: number): boolean {
    const budget = TOKEN_BUDGETS[category];
    const used = this.currentUsage(category);
    return used + tokens <= budget;
  }

  /**
   * Record token usage with a timestamp for the sliding window.
   */
  record(category: keyof typeof TOKEN_BUDGETS, tokens: number): void {
    const entries = this.usage.get(category) ?? [];
    entries.push({ tokens, timestamp: Date.now() });
    this.usage.set(category, entries);
  }
}
