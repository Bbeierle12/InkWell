/**
 * Queue Manager
 *
 * Priority queue with cancellation for AI requests.
 * Manages token budgets and back-pressure.
 */
import type { QueuedRequest } from '@inkwell/shared';

export class QueueManager {
  private queue: QueuedRequest[] = [];

  /**
   * Add a request to the priority queue.
   *
   * - Deduplicates by contentHash: if an existing request shares the same
   *   contentHash, the older one is aborted and removed.
   * - Cancels older requests for the same operation type: if an existing
   *   request has the same operation, it is aborted and removed.
   * - Inserts by priority (higher priority = dequeued first). Within the
   *   same priority, items are ordered FIFO by createdAt (oldest first).
   */
  enqueue(request: QueuedRequest): void {
    // 1. Cancel and remove any existing request with the same contentHash
    this.cancelMatching((r) => r.contentHash === request.contentHash);

    // 2. Cancel and remove any existing request with the same operation type
    this.cancelMatching((r) => r.operation === request.operation);

    // 3. Insert in sorted position: highest priority first,
    //    and within same priority, oldest createdAt first (FIFO).
    //    We find the insertion index such that the queue stays sorted
    //    for dequeue() to simply shift from position 0.
    //
    //    Queue order: [highest-priority & oldest-createdAt, ..., lowest-priority & newest-createdAt]
    //    dequeue() removes from index 0.
    let insertIdx = this.queue.length; // default: end of array
    for (let i = 0; i < this.queue.length; i++) {
      const existing = this.queue[i];
      // Insert before an item that has lower priority
      if (request.priority > existing.priority) {
        insertIdx = i;
        break;
      }
      // Same priority: insert before the first item with a later createdAt
      // (so the new item goes after items with earlier or equal createdAt)
      if (request.priority === existing.priority && request.createdAt < existing.createdAt) {
        insertIdx = i;
        break;
      }
    }

    this.queue.splice(insertIdx, 0, request);
  }

  /**
   * Dequeue the highest-priority request.
   * If equal priority, returns the oldest (FIFO by createdAt).
   */
  dequeue(): QueuedRequest | undefined {
    if (this.queue.length === 0) return undefined;
    return this.queue.shift();
  }

  /**
   * Cancel all pending requests.
   * Calls abort() on every AbortController and clears the queue.
   * Ref: Invariant: no-orphaned-streams-after-close
   */
  cancelAll(): void {
    for (const request of this.queue) {
      request.abortController.abort();
    }
    this.queue.length = 0;
  }

  get size(): number {
    return this.queue.length;
  }

  /**
   * Cancel and remove all queue entries that match the given predicate.
   * Aborts the AbortController of each matching entry.
   */
  private cancelMatching(predicate: (r: QueuedRequest) => boolean): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (predicate(this.queue[i])) {
        this.queue[i].abortController.abort();
        this.queue.splice(i, 1);
      }
    }
  }
}
