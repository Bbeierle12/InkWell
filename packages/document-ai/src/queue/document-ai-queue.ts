/**
 * DocumentAI Queue
 *
 * Composes QueueManager, TokenBudgetTracker, BackpressureManager,
 * and Debouncer into a single orchestration layer.
 *
 * Features:
 * - Priority ordering with latest-wins cancellation
 * - Configurable debounce window (default 500ms)
 * - Content-hash deduplication
 * - Token budget enforcement with backpressure
 * - Clean teardown with no orphaned timers/callbacks
 */
import type { QueuedRequest } from '@inkwell/shared';
import { DEBOUNCE_MS, TOKEN_BUDGETS } from '@inkwell/shared';
import { QueueManager } from './index';
import { TokenBudgetTracker } from './token-budget';
import { BackpressureManager } from './backpressure';
import { Debouncer } from './debouncer';

/** Maps operation types to token budget categories. */
function budgetCategory(
  operation: string,
): keyof typeof TOKEN_BUDGETS {
  switch (operation) {
    case 'inline_suggest':
      return 'inline';
    case 'deep_critique':
      return 'critique';
    default:
      return 'documentOps';
  }
}

export interface DocumentAIQueueOptions {
  debounceMs?: number;
}

export class DocumentAIQueue {
  readonly queue: QueueManager;
  readonly budget: TokenBudgetTracker;
  readonly backpressure: BackpressureManager;
  readonly debouncer: Debouncer<QueuedRequest>;

  private tornDown = false;

  constructor(options?: DocumentAIQueueOptions) {
    this.queue = new QueueManager();
    this.budget = new TokenBudgetTracker();
    this.backpressure = new BackpressureManager();
    this.debouncer = new Debouncer<QueuedRequest>(
      options?.debounceMs ?? DEBOUNCE_MS,
    );
  }

  /**
   * Submit a request through the debouncer.
   *
   * The request is held for the debounce window. If another request
   * arrives before the window expires, the previous one is discarded.
   * After the window, the request enters the priority queue subject
   * to budget checks.
   *
   * Returns false if the system has been torn down.
   */
  submit(request: QueuedRequest): boolean {
    if (this.tornDown) return false;

    this.debouncer.schedule(request, (req) => {
      this.enqueueWithBudget(req);
    });
    return true;
  }

  /**
   * Bypass debounce and enqueue immediately (for user-initiated operations
   * that should not be delayed).
   *
   * Returns false if budget is exhausted or system is torn down.
   */
  enqueueImmediate(request: QueuedRequest): boolean {
    if (this.tornDown) return false;
    return this.enqueueWithBudget(request);
  }

  /**
   * Dequeue the next request from the priority queue.
   */
  dequeue(): QueuedRequest | undefined {
    return this.queue.dequeue();
  }

  /**
   * Record actual token usage after a request completes.
   * May trigger backpressure if budget is near exhaustion.
   */
  recordUsage(operation: string, tokens: number): void {
    const category = budgetCategory(operation);
    this.budget.record(category, tokens);

    // Enter backpressure if *any* category cannot afford a minimal request
    if (!this.budget.canSpend(category, 1)) {
      this.backpressure.pause();
    }
  }

  /**
   * Check budget availability for a given operation.
   */
  canAfford(operation: string, estimatedTokens: number): boolean {
    const category = budgetCategory(operation);
    return this.budget.canSpend(category, estimatedTokens);
  }

  /**
   * Resume from backpressure (called when budget window rolls over).
   */
  resumeIfBudgetAvailable(): void {
    if (this.backpressure.isPaused) {
      // Check if at least inline budget has room
      if (this.budget.canSpend('inline', 1)) {
        this.backpressure.resume();
      }
    }
  }

  get size(): number {
    return this.queue.size;
  }

  get isPaused(): boolean {
    return this.backpressure.isPaused;
  }

  get isTornDown(): boolean {
    return this.tornDown;
  }

  /**
   * Teardown: cancel all pending requests, debounce timers, and
   * mark the queue as permanently closed.
   *
   * Invariant: no-orphaned-streams-after-close
   * Invariant: no-late-mutations-after-teardown
   *
   * After teardown:
   * - submit() and enqueueImmediate() return false
   * - No timers remain active
   * - All AbortControllers are aborted
   */
  teardown(): void {
    this.tornDown = true;
    this.debouncer.teardown();
    this.queue.cancelAll();
  }

  /**
   * Enqueue with budget check. Returns false if budget is exhausted.
   */
  private enqueueWithBudget(request: QueuedRequest): boolean {
    if (this.tornDown) return false;

    const category = budgetCategory(request.operation);
    // Check if budget allows this request (use a minimal check of 1 token)
    if (!this.budget.canSpend(category, 1)) {
      if (!this.backpressure.isPaused) {
        this.backpressure.pause();
      }
      request.abortController.abort();
      return false;
    }

    this.queue.enqueue(request);
    return true;
  }
}
