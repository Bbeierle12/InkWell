import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueManager } from '../index';
import { TokenBudgetTracker } from '../token-budget';
import { BackpressureManager } from '../backpressure';
import { OperationType } from '@inkwell/shared';
import type { QueuedRequest } from '@inkwell/shared';

/**
 * Helper to create a QueuedRequest with sensible defaults.
 */
function makeRequest(overrides: Partial<QueuedRequest> = {}): QueuedRequest {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    operation: overrides.operation ?? OperationType.InlineSuggest,
    priority: overrides.priority ?? 1,
    payload: overrides.payload ?? {},
    abortController: overrides.abortController ?? new AbortController(),
    createdAt: overrides.createdAt ?? Date.now(),
    contentHash: overrides.contentHash ?? crypto.randomUUID(),
  };
}

// ---------------------------------------------------------------------------
// 2.2 Queue Manager — QueueManager
// ---------------------------------------------------------------------------
describe('2.2 Queue Manager — QueueManager', () => {
  let qm: QueueManager;

  beforeEach(() => {
    qm = new QueueManager();
  });

  // --- Priority ordering ---------------------------------------------------
  describe('enqueue by priority', () => {
    it('should dequeue higher-priority items first', () => {
      // Use different operation types so same-op cancellation does not interfere
      const low = makeRequest({ priority: 1, operation: OperationType.InlineSuggest });
      const mid = makeRequest({ priority: 5, operation: OperationType.Rewrite });
      const high = makeRequest({ priority: 10, operation: OperationType.Summarize });

      qm.enqueue(low);
      qm.enqueue(mid);
      qm.enqueue(high);

      expect(qm.dequeue()).toBe(high);
      expect(qm.dequeue()).toBe(mid);
      expect(qm.dequeue()).toBe(low);
    });

    it('should maintain priority order when items are inserted in mixed order', () => {
      const r3 = makeRequest({ priority: 3, operation: OperationType.InlineSuggest });
      const r7 = makeRequest({ priority: 7, operation: OperationType.Rewrite });
      const r1 = makeRequest({ priority: 1, operation: OperationType.Summarize });
      const r5 = makeRequest({ priority: 5, operation: OperationType.Expand });

      qm.enqueue(r3);
      qm.enqueue(r7);
      qm.enqueue(r1);
      qm.enqueue(r5);

      expect(qm.dequeue()!.priority).toBe(7);
      expect(qm.dequeue()!.priority).toBe(5);
      expect(qm.dequeue()!.priority).toBe(3);
      expect(qm.dequeue()!.priority).toBe(1);
    });
  });

  // --- FIFO for equal priority ---------------------------------------------
  describe('FIFO for equal priority', () => {
    it('should dequeue same-priority items in createdAt order (oldest first)', () => {
      // Use different operation types to avoid same-op cancellation
      const first = makeRequest({ priority: 5, createdAt: 1000, operation: OperationType.InlineSuggest });
      const second = makeRequest({ priority: 5, createdAt: 2000, operation: OperationType.Rewrite });
      const third = makeRequest({ priority: 5, createdAt: 3000, operation: OperationType.Summarize });

      qm.enqueue(third);
      qm.enqueue(first);
      qm.enqueue(second);

      expect(qm.dequeue()).toBe(first);
      expect(qm.dequeue()).toBe(second);
      expect(qm.dequeue()).toBe(third);
    });

    it('should handle a mix of priorities and FIFO within same priority', () => {
      // Use different operation types to avoid same-op cancellation
      const highA = makeRequest({ priority: 10, createdAt: 100, operation: OperationType.InlineSuggest });
      const highB = makeRequest({ priority: 10, createdAt: 200, operation: OperationType.Rewrite });
      const lowA = makeRequest({ priority: 1, createdAt: 50, operation: OperationType.Summarize });

      qm.enqueue(lowA);
      qm.enqueue(highB);
      qm.enqueue(highA);

      // high priority first, FIFO within same priority
      expect(qm.dequeue()).toBe(highA);
      expect(qm.dequeue()).toBe(highB);
      expect(qm.dequeue()).toBe(lowA);
    });
  });

  // --- Deduplicate by contentHash ------------------------------------------
  describe('deduplicate by contentHash', () => {
    it('should cancel older request when same contentHash is enqueued', () => {
      const olderAc = new AbortController();
      const older = makeRequest({
        contentHash: 'hash-abc',
        abortController: olderAc,
        createdAt: 1000,
        priority: 5,
      });
      const newer = makeRequest({
        contentHash: 'hash-abc',
        createdAt: 2000,
        priority: 5,
      });

      qm.enqueue(older);
      expect(qm.size).toBe(1);

      qm.enqueue(newer);
      // Older was removed and replaced
      expect(qm.size).toBe(1);
      // The older AbortController should have been aborted
      expect(olderAc.signal.aborted).toBe(true);
      // Dequeue should return the newer one
      expect(qm.dequeue()).toBe(newer);
    });

    it('should not cancel requests with different contentHashes', () => {
      const acA = new AbortController();
      const acB = new AbortController();
      // Use different operation types so same-op cancellation does not interfere
      const reqA = makeRequest({ contentHash: 'hash-a', abortController: acA, operation: OperationType.Rewrite });
      const reqB = makeRequest({ contentHash: 'hash-b', abortController: acB, operation: OperationType.Summarize });

      qm.enqueue(reqA);
      qm.enqueue(reqB);

      expect(qm.size).toBe(2);
      expect(acA.signal.aborted).toBe(false);
      expect(acB.signal.aborted).toBe(false);
    });
  });

  // --- Cancel older requests for same operation type -----------------------
  describe('cancel older requests for same operation type', () => {
    it('should cancel previous request with the same operation type', () => {
      const olderAc = new AbortController();
      const older = makeRequest({
        operation: OperationType.Rewrite,
        abortController: olderAc,
        createdAt: 1000,
      });
      const newer = makeRequest({
        operation: OperationType.Rewrite,
        createdAt: 2000,
      });

      qm.enqueue(older);
      qm.enqueue(newer);

      // older request should have been cancelled and removed
      expect(olderAc.signal.aborted).toBe(true);
      expect(qm.size).toBe(1);
      expect(qm.dequeue()).toBe(newer);
    });

    it('should not cancel requests of different operation types', () => {
      const acA = new AbortController();
      const acB = new AbortController();
      const reqA = makeRequest({
        operation: OperationType.Rewrite,
        abortController: acA,
      });
      const reqB = makeRequest({
        operation: OperationType.Summarize,
        abortController: acB,
      });

      qm.enqueue(reqA);
      qm.enqueue(reqB);

      expect(qm.size).toBe(2);
      expect(acA.signal.aborted).toBe(false);
      expect(acB.signal.aborted).toBe(false);
    });

    it('should cancel multiple older requests for the same operation type', () => {
      const ac1 = new AbortController();
      const ac2 = new AbortController();
      const req1 = makeRequest({
        operation: OperationType.Expand,
        abortController: ac1,
        createdAt: 1000,
      });
      const req2 = makeRequest({
        operation: OperationType.Expand,
        abortController: ac2,
        createdAt: 2000,
      });
      const req3 = makeRequest({
        operation: OperationType.Expand,
        createdAt: 3000,
      });

      qm.enqueue(req1);
      qm.enqueue(req2);
      // req1 already cancelled by req2
      expect(ac1.signal.aborted).toBe(true);

      qm.enqueue(req3);
      // req2 cancelled by req3
      expect(ac2.signal.aborted).toBe(true);

      expect(qm.size).toBe(1);
      expect(qm.dequeue()).toBe(req3);
    });
  });

  // --- cancelAll -----------------------------------------------------------
  describe('cancelAll (Invariant: no-orphaned-streams-after-close)', () => {
    it('should abort all AbortControllers and empty the queue', () => {
      const ac1 = new AbortController();
      const ac2 = new AbortController();
      const ac3 = new AbortController();

      qm.enqueue(makeRequest({ abortController: ac1, operation: OperationType.InlineSuggest }));
      qm.enqueue(makeRequest({ abortController: ac2, operation: OperationType.Summarize }));
      qm.enqueue(makeRequest({ abortController: ac3, operation: OperationType.Critique }));

      expect(qm.size).toBe(3);

      qm.cancelAll();

      expect(qm.size).toBe(0);
      expect(ac1.signal.aborted).toBe(true);
      expect(ac2.signal.aborted).toBe(true);
      expect(ac3.signal.aborted).toBe(true);
    });

    it('should handle cancelAll on an empty queue gracefully', () => {
      expect(() => qm.cancelAll()).not.toThrow();
      expect(qm.size).toBe(0);
    });
  });

  // --- Queue size tracking -------------------------------------------------
  describe('size getter', () => {
    it('should return 0 for a new queue', () => {
      expect(qm.size).toBe(0);
    });

    it('should increase after enqueue', () => {
      qm.enqueue(makeRequest({ operation: OperationType.InlineSuggest }));
      expect(qm.size).toBe(1);
      qm.enqueue(makeRequest({ operation: OperationType.Summarize }));
      expect(qm.size).toBe(2);
      qm.enqueue(makeRequest({ operation: OperationType.Rewrite }));
      expect(qm.size).toBe(3);
    });

    it('should decrease after dequeue', () => {
      qm.enqueue(makeRequest({ operation: OperationType.InlineSuggest }));
      qm.enqueue(makeRequest({ operation: OperationType.Summarize }));
      qm.dequeue();
      expect(qm.size).toBe(1);
    });

    it('should be 0 after cancelAll', () => {
      qm.enqueue(makeRequest({ operation: OperationType.InlineSuggest }));
      qm.enqueue(makeRequest({ operation: OperationType.Summarize }));
      qm.cancelAll();
      expect(qm.size).toBe(0);
    });
  });

  // --- Dequeue from empty queue --------------------------------------------
  describe('dequeue from empty queue', () => {
    it('should return undefined when queue is empty', () => {
      expect(qm.dequeue()).toBeUndefined();
    });

    it('should return undefined after all items are dequeued', () => {
      qm.enqueue(makeRequest());
      qm.dequeue();
      expect(qm.dequeue()).toBeUndefined();
    });
  });

  // --- Interleaved operations ----------------------------------------------
  describe('multiple operations interleaved', () => {
    it('should handle enqueue, dequeue, cancel in sequence correctly', () => {
      const ac1 = new AbortController();
      const ac2 = new AbortController();
      const ac3 = new AbortController();

      const req1 = makeRequest({
        priority: 3,
        operation: OperationType.InlineSuggest,
        abortController: ac1,
        createdAt: 100,
      });
      const req2 = makeRequest({
        priority: 7,
        operation: OperationType.Rewrite,
        abortController: ac2,
        createdAt: 200,
      });
      const req3 = makeRequest({
        priority: 5,
        operation: OperationType.Summarize,
        abortController: ac3,
        createdAt: 300,
      });

      qm.enqueue(req1);
      qm.enqueue(req2);
      qm.enqueue(req3);
      expect(qm.size).toBe(3);

      // Dequeue highest priority (req2, priority 7)
      const top = qm.dequeue();
      expect(top).toBe(req2);
      expect(qm.size).toBe(2);

      // Enqueue a new request that replaces same operation type as req1
      const ac4 = new AbortController();
      const req4 = makeRequest({
        priority: 1,
        operation: OperationType.InlineSuggest,
        abortController: ac4,
        createdAt: 400,
      });
      qm.enqueue(req4);
      // req1 should be cancelled (same operation type)
      expect(ac1.signal.aborted).toBe(true);
      expect(qm.size).toBe(2); // req3 + req4

      // Cancel all remaining
      qm.cancelAll();
      expect(qm.size).toBe(0);
      expect(ac3.signal.aborted).toBe(true);
      expect(ac4.signal.aborted).toBe(true);
    });

    it('should correctly handle contentHash dedup and operation type cancel together', () => {
      const ac1 = new AbortController();
      const ac2 = new AbortController();

      // Two requests: same operation AND same contentHash
      const req1 = makeRequest({
        operation: OperationType.Rewrite,
        contentHash: 'same-hash',
        abortController: ac1,
        createdAt: 100,
      });
      const req2 = makeRequest({
        operation: OperationType.Rewrite,
        contentHash: 'same-hash',
        abortController: ac2,
        createdAt: 200,
      });

      qm.enqueue(req1);
      qm.enqueue(req2);

      // req1 cancelled (both by hash dedup and op type)
      expect(ac1.signal.aborted).toBe(true);
      expect(qm.size).toBe(1);
      expect(qm.dequeue()).toBe(req2);
    });
  });
});

// ---------------------------------------------------------------------------
// 2.2 Queue Manager — TokenBudgetTracker
// ---------------------------------------------------------------------------
describe('2.2 Queue Manager — TokenBudgetTracker', () => {
  let tracker: TokenBudgetTracker;

  beforeEach(() => {
    tracker = new TokenBudgetTracker();
  });

  describe('canSpend', () => {
    it('should return true when budget has not been used', () => {
      expect(tracker.canSpend('inline', 1000)).toBe(true);
      expect(tracker.canSpend('documentOps', 16000)).toBe(true);
      expect(tracker.canSpend('critique', 32000)).toBe(true);
    });

    it('should return true when usage is within budget', () => {
      tracker.record('inline', 2000);
      expect(tracker.canSpend('inline', 1999)).toBe(true);
    });

    it('should return false when usage exceeds budget', () => {
      tracker.record('inline', 3500);
      expect(tracker.canSpend('inline', 501)).toBe(false);
    });

    it('should return false when requested amount alone exceeds budget', () => {
      expect(tracker.canSpend('inline', 4001)).toBe(false);
    });

    it('should return true when usage is exactly at the limit', () => {
      tracker.record('inline', 2000);
      // 2000 + 2000 = 4000 = budget; should be within budget (<=)
      expect(tracker.canSpend('inline', 2000)).toBe(true);
    });

    it('should track categories independently', () => {
      tracker.record('inline', 3999);
      // inline is near max
      expect(tracker.canSpend('inline', 2)).toBe(false);
      // documentOps is untouched
      expect(tracker.canSpend('documentOps', 1000)).toBe(true);
    });
  });

  describe('sliding window expiry', () => {
    it('should expire entries older than 60 seconds', () => {
      vi.useFakeTimers();

      tracker.record('inline', 3500);
      expect(tracker.canSpend('inline', 1000)).toBe(false);

      // Advance time by 61 seconds
      vi.advanceTimersByTime(61_000);

      // Old entry should have expired, budget is free again
      expect(tracker.canSpend('inline', 1000)).toBe(true);

      vi.useRealTimers();
    });

    it('should keep recent entries and expire old ones in the same window', () => {
      vi.useFakeTimers();

      tracker.record('inline', 2000); // t=0
      vi.advanceTimersByTime(30_000);  // t=30s
      tracker.record('inline', 1500); // t=30s

      vi.advanceTimersByTime(31_000);  // t=61s — first entry expired, second is still valid

      // Only 1500 tokens used now (the t=30s entry)
      expect(tracker.canSpend('inline', 2500)).toBe(true);
      expect(tracker.canSpend('inline', 2501)).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('record', () => {
    it('should accumulate multiple records within the window', () => {
      tracker.record('inline', 1000);
      tracker.record('inline', 1000);
      tracker.record('inline', 1000);

      // 3000 used, only 1000 left
      expect(tracker.canSpend('inline', 1000)).toBe(true);
      expect(tracker.canSpend('inline', 1001)).toBe(false);
    });

    it('should work for all budget categories', () => {
      tracker.record('documentOps', 15000);
      expect(tracker.canSpend('documentOps', 1000)).toBe(true);
      expect(tracker.canSpend('documentOps', 1001)).toBe(false);

      tracker.record('critique', 31000);
      expect(tracker.canSpend('critique', 1000)).toBe(true);
      expect(tracker.canSpend('critique', 1001)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 2.2 Queue Manager — BackpressureManager
// ---------------------------------------------------------------------------
describe('2.2 Queue Manager — BackpressureManager', () => {
  let bp: BackpressureManager;

  beforeEach(() => {
    bp = new BackpressureManager();
  });

  describe('initial state', () => {
    it('should start in resumed (not paused) state', () => {
      expect(bp.isPaused).toBe(false);
    });
  });

  describe('pause', () => {
    it('should set isPaused to true', () => {
      bp.pause();
      expect(bp.isPaused).toBe(true);
    });

    it('should stay paused if pause is called multiple times', () => {
      bp.pause();
      bp.pause();
      expect(bp.isPaused).toBe(true);
    });
  });

  describe('resume', () => {
    it('should set isPaused to false', () => {
      bp.pause();
      bp.resume();
      expect(bp.isPaused).toBe(false);
    });

    it('should stay resumed if resume is called multiple times', () => {
      bp.resume();
      bp.resume();
      expect(bp.isPaused).toBe(false);
    });
  });

  describe('onStateChange callback', () => {
    it('should fire callback when pausing', () => {
      const cb = vi.fn();
      bp.onStateChange(cb);

      bp.pause();
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(true);
    });

    it('should fire callback when resuming', () => {
      const cb = vi.fn();
      bp.onStateChange(cb);

      bp.pause();
      bp.resume();
      expect(cb).toHaveBeenCalledTimes(2);
      expect(cb).toHaveBeenLastCalledWith(false);
    });

    it('should fire callback even when state does not change (idempotent calls)', () => {
      const cb = vi.fn();
      bp.onStateChange(cb);

      bp.pause();
      bp.pause(); // already paused
      // Both calls trigger the callback (it reflects the action)
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it('should work without a callback registered', () => {
      // No callback set; should not throw
      expect(() => bp.pause()).not.toThrow();
      expect(() => bp.resume()).not.toThrow();
    });

    it('should allow replacing the callback', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();

      bp.onStateChange(cb1);
      bp.pause();
      expect(cb1).toHaveBeenCalledTimes(1);

      bp.onStateChange(cb2);
      bp.resume();
      expect(cb1).toHaveBeenCalledTimes(1); // not called again
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledWith(false);
    });
  });

  describe('pause/resume cycle', () => {
    it('should toggle correctly over multiple cycles', () => {
      expect(bp.isPaused).toBe(false);
      bp.pause();
      expect(bp.isPaused).toBe(true);
      bp.resume();
      expect(bp.isPaused).toBe(false);
      bp.pause();
      expect(bp.isPaused).toBe(true);
      bp.resume();
      expect(bp.isPaused).toBe(false);
    });
  });
});
