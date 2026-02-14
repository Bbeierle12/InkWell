import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DocumentAIQueue } from '../document-ai-queue';
import { OperationType } from '@inkwell/shared';
import type { QueuedRequest } from '@inkwell/shared';

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

describe('2.2 Queue Manager — DocumentAIQueue (Integrated)', () => {
  let aiQueue: DocumentAIQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    aiQueue = new DocumentAIQueue({ debounceMs: 100 });
  });

  afterEach(() => {
    aiQueue.teardown();
    vi.useRealTimers();
  });

  // --- Debounced submit -------------------------------------------------

  describe('debounced submit', () => {
    it('should not enqueue immediately — waits for debounce window', () => {
      const req = makeRequest();
      aiQueue.submit(req);

      expect(aiQueue.size).toBe(0);
    });

    it('should enqueue after debounce window expires', () => {
      const req = makeRequest();
      aiQueue.submit(req);

      vi.advanceTimersByTime(100);
      expect(aiQueue.size).toBe(1);
    });

    it('should collapse rapid-fire submits to the latest request', () => {
      const req1 = makeRequest({ id: 'r1', operation: OperationType.InlineSuggest });
      const req2 = makeRequest({ id: 'r2', operation: OperationType.InlineSuggest });
      const req3 = makeRequest({ id: 'r3', operation: OperationType.InlineSuggest });

      aiQueue.submit(req1);
      vi.advanceTimersByTime(30);
      aiQueue.submit(req2);
      vi.advanceTimersByTime(30);
      aiQueue.submit(req3);
      vi.advanceTimersByTime(100);

      // Only req3 should have been enqueued
      expect(aiQueue.size).toBe(1);
      const dequeued = aiQueue.dequeue();
      expect(dequeued?.id).toBe('r3');
    });
  });

  // --- Immediate enqueue ------------------------------------------------

  describe('enqueueImmediate', () => {
    it('should bypass debounce and enqueue immediately', () => {
      const req = makeRequest({ operation: OperationType.Rewrite });
      const result = aiQueue.enqueueImmediate(req);

      expect(result).toBe(true);
      expect(aiQueue.size).toBe(1);
    });

    it('should reject when budget is exhausted', () => {
      // Exhaust the inline budget (4000 tokens)
      aiQueue.recordUsage('inline_suggest', 4000);

      const ac = new AbortController();
      const req = makeRequest({
        operation: OperationType.InlineSuggest,
        abortController: ac,
      });

      const result = aiQueue.enqueueImmediate(req);
      expect(result).toBe(false);
      expect(ac.signal.aborted).toBe(true);
    });
  });

  // --- Token budget integration -----------------------------------------

  describe('token budget integration', () => {
    it('should check budget before enqueuing', () => {
      expect(aiQueue.canAfford('inline_suggest', 1000)).toBe(true);

      aiQueue.recordUsage('inline_suggest', 3500);
      expect(aiQueue.canAfford('inline_suggest', 501)).toBe(false);
      expect(aiQueue.canAfford('inline_suggest', 500)).toBe(true);
    });

    it('should enter backpressure when budget is fully consumed', () => {
      expect(aiQueue.isPaused).toBe(false);

      aiQueue.recordUsage('inline_suggest', 4000);
      expect(aiQueue.isPaused).toBe(true);
    });

    it('should reject debounced submit when budget is exhausted', () => {
      aiQueue.recordUsage('inline_suggest', 4000);

      const ac = new AbortController();
      const req = makeRequest({ abortController: ac });
      aiQueue.submit(req);

      // Let debounce fire
      vi.advanceTimersByTime(100);

      // Request should have been rejected (aborted)
      expect(ac.signal.aborted).toBe(true);
      expect(aiQueue.size).toBe(0);
    });

    it('should track different budget categories independently', () => {
      aiQueue.recordUsage('inline_suggest', 3999);
      expect(aiQueue.canAfford('inline_suggest', 2)).toBe(false);
      expect(aiQueue.canAfford('deep_critique', 1000)).toBe(true);
      expect(aiQueue.canAfford('rewrite', 1000)).toBe(true);
    });
  });

  // --- Backpressure integration -----------------------------------------

  describe('backpressure integration', () => {
    it('should expose isPaused state', () => {
      expect(aiQueue.isPaused).toBe(false);
    });

    it('should allow subscribing to backpressure state changes', () => {
      const cb = vi.fn();
      aiQueue.backpressure.onStateChange(cb);

      aiQueue.recordUsage('inline_suggest', 4000);
      expect(cb).toHaveBeenCalledWith(true);
    });

    it('should resume when budget becomes available', () => {
      aiQueue.recordUsage('inline_suggest', 4000);
      expect(aiQueue.isPaused).toBe(true);

      // Advance past the 60-second sliding window
      vi.advanceTimersByTime(61_000);
      aiQueue.resumeIfBudgetAvailable();

      expect(aiQueue.isPaused).toBe(false);
    });
  });

  // --- Teardown (Invariant: no-orphaned-streams-after-close) -----------

  describe('teardown (Invariant: no-orphaned-streams-after-close)', () => {
    it('should abort all pending requests on teardown', () => {
      const ac1 = new AbortController();
      const ac2 = new AbortController();
      const ac3 = new AbortController();

      aiQueue.enqueueImmediate(
        makeRequest({ abortController: ac1, operation: OperationType.InlineSuggest }),
      );
      aiQueue.enqueueImmediate(
        makeRequest({ abortController: ac2, operation: OperationType.Rewrite }),
      );
      aiQueue.enqueueImmediate(
        makeRequest({ abortController: ac3, operation: OperationType.Summarize }),
      );

      expect(aiQueue.size).toBe(3);

      aiQueue.teardown();

      expect(aiQueue.size).toBe(0);
      expect(ac1.signal.aborted).toBe(true);
      expect(ac2.signal.aborted).toBe(true);
      expect(ac3.signal.aborted).toBe(true);
    });

    it('should cancel pending debounce timer on teardown', () => {
      const cb = vi.fn();
      const req = makeRequest();
      aiQueue.submit(req);

      // Teardown before debounce fires
      aiQueue.teardown();
      vi.advanceTimersByTime(200);

      // Nothing should have been enqueued
      expect(aiQueue.size).toBe(0);
    });

    it('should reject submit() after teardown', () => {
      aiQueue.teardown();

      const result = aiQueue.submit(makeRequest());
      expect(result).toBe(false);
    });

    it('should reject enqueueImmediate() after teardown', () => {
      aiQueue.teardown();

      const result = aiQueue.enqueueImmediate(makeRequest());
      expect(result).toBe(false);
    });

    it('should report isTornDown after teardown', () => {
      expect(aiQueue.isTornDown).toBe(false);
      aiQueue.teardown();
      expect(aiQueue.isTornDown).toBe(true);
    });

    it('should leave no orphaned callbacks after teardown', () => {
      const stateChangeCb = vi.fn();
      aiQueue.backpressure.onStateChange(stateChangeCb);

      // Submit some work
      const ac = new AbortController();
      aiQueue.submit(makeRequest({ abortController: ac }));

      // Teardown
      aiQueue.teardown();

      // Advance timers to ensure no lingering setTimeout fires
      vi.advanceTimersByTime(10_000);

      // The debounced request should never have enqueued
      expect(aiQueue.size).toBe(0);

      // No additional state changes after teardown
      const callCountAtTeardown = stateChangeCb.mock.calls.length;
      vi.advanceTimersByTime(10_000);
      expect(stateChangeCb).toHaveBeenCalledTimes(callCountAtTeardown);
    });

    it('should handle teardown on empty queue gracefully', () => {
      expect(() => aiQueue.teardown()).not.toThrow();
      expect(aiQueue.size).toBe(0);
      expect(aiQueue.isTornDown).toBe(true);
    });

    it('should handle double teardown gracefully', () => {
      aiQueue.teardown();
      expect(() => aiQueue.teardown()).not.toThrow();
    });
  });
});
