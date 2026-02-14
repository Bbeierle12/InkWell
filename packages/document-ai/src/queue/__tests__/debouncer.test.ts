import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Debouncer } from '../debouncer';
import { DEBOUNCE_MS } from '@inkwell/shared';

describe('2.2 Queue Manager — Debouncer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic debounce', () => {
    it('should invoke callback after debounce window expires', () => {
      const debouncer = new Debouncer<string>();
      const cb = vi.fn();

      debouncer.schedule('hello', cb);
      expect(cb).not.toHaveBeenCalled();

      vi.advanceTimersByTime(DEBOUNCE_MS);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith('hello');
    });

    it('should not invoke callback before window expires', () => {
      const debouncer = new Debouncer<string>();
      const cb = vi.fn();

      debouncer.schedule('hello', cb);
      vi.advanceTimersByTime(DEBOUNCE_MS - 1);

      expect(cb).not.toHaveBeenCalled();
    });

    it('should use custom debounce window', () => {
      const debouncer = new Debouncer<string>(100);
      const cb = vi.fn();

      debouncer.schedule('hello', cb);
      vi.advanceTimersByTime(99);
      expect(cb).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('rapid-fire collapsing', () => {
    it('should collapse rapid-fire requests to the latest value', () => {
      const debouncer = new Debouncer<string>(100);
      const cb = vi.fn();

      debouncer.schedule('first', cb);
      vi.advanceTimersByTime(50);

      debouncer.schedule('second', cb);
      vi.advanceTimersByTime(50);

      debouncer.schedule('third', cb);
      vi.advanceTimersByTime(100);

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith('third');
    });

    it('should restart the timer on each new schedule call', () => {
      const debouncer = new Debouncer<number>(100);
      const cb = vi.fn();

      debouncer.schedule(1, cb);
      vi.advanceTimersByTime(80);
      expect(cb).not.toHaveBeenCalled();

      debouncer.schedule(2, cb);
      vi.advanceTimersByTime(80);
      expect(cb).not.toHaveBeenCalled();

      vi.advanceTimersByTime(20);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(2);
    });

    it('should discard all intermediate values', () => {
      const debouncer = new Debouncer<string>(50);
      const cb = vi.fn();

      for (let i = 0; i < 10; i++) {
        debouncer.schedule(`value-${i}`, cb);
        vi.advanceTimersByTime(10);
      }

      vi.advanceTimersByTime(50);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith('value-9');
    });
  });

  describe('cancel', () => {
    it('should prevent callback invocation when cancelled', () => {
      const debouncer = new Debouncer<string>(100);
      const cb = vi.fn();

      debouncer.schedule('hello', cb);
      vi.advanceTimersByTime(50);
      debouncer.cancel();

      vi.advanceTimersByTime(100);
      expect(cb).not.toHaveBeenCalled();
    });

    it('should be safe to cancel when nothing is pending', () => {
      const debouncer = new Debouncer<string>();
      expect(() => debouncer.cancel()).not.toThrow();
    });

    it('should be safe to cancel multiple times', () => {
      const debouncer = new Debouncer<string>();
      debouncer.schedule('hello', vi.fn());
      debouncer.cancel();
      debouncer.cancel();
      debouncer.cancel();
    });
  });

  describe('pending state', () => {
    it('should report pending when a timer is active', () => {
      const debouncer = new Debouncer<string>(100);
      expect(debouncer.pending).toBe(false);

      debouncer.schedule('hello', vi.fn());
      expect(debouncer.pending).toBe(true);
    });

    it('should report not pending after callback fires', () => {
      const debouncer = new Debouncer<string>(100);
      debouncer.schedule('hello', vi.fn());

      vi.advanceTimersByTime(100);
      expect(debouncer.pending).toBe(false);
    });

    it('should report not pending after cancel', () => {
      const debouncer = new Debouncer<string>(100);
      debouncer.schedule('hello', vi.fn());
      debouncer.cancel();

      expect(debouncer.pending).toBe(false);
    });
  });

  describe('teardown', () => {
    it('should cancel pending timer on teardown', () => {
      const debouncer = new Debouncer<string>(100);
      const cb = vi.fn();

      debouncer.schedule('hello', cb);
      debouncer.teardown();

      vi.advanceTimersByTime(200);
      expect(cb).not.toHaveBeenCalled();
      expect(debouncer.pending).toBe(false);
    });
  });

  describe('default window', () => {
    it('should use DEBOUNCE_MS (500) as default window', () => {
      const debouncer = new Debouncer<string>();
      const cb = vi.fn();

      debouncer.schedule('hello', cb);

      vi.advanceTimersByTime(499);
      expect(cb).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
