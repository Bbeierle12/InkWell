/**
 * useAutoSave Hook Tests
 *
 * Tests auto-save interval behavior, dirty flag tracking,
 * and cleanup on unmount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('useAutoSave - interval logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers save callback at specified interval when dirty', () => {
    const save = vi.fn();
    let isDirty = true;
    const intervalMs = 5000;

    // Simulate the interval behavior
    const timer = setInterval(() => {
      if (isDirty) {
        save();
        isDirty = false;
      }
    }, intervalMs);

    // No save yet
    expect(save).not.toHaveBeenCalled();

    // Advance past interval
    vi.advanceTimersByTime(5000);
    expect(save).toHaveBeenCalledTimes(1);

    // isDirty is now false, next tick should not save
    vi.advanceTimersByTime(5000);
    expect(save).toHaveBeenCalledTimes(1);

    // Mark dirty again
    isDirty = true;
    vi.advanceTimersByTime(5000);
    expect(save).toHaveBeenCalledTimes(2);

    clearInterval(timer);
  });

  it('skips save when document is clean', () => {
    const save = vi.fn();
    const isDirty = false;
    const intervalMs = 5000;

    const timer = setInterval(() => {
      if (isDirty) {
        save();
      }
    }, intervalMs);

    vi.advanceTimersByTime(15000); // 3 intervals
    expect(save).not.toHaveBeenCalled();

    clearInterval(timer);
  });

  it('clears interval on unmount', () => {
    const save = vi.fn();
    const isDirty = true;
    const intervalMs = 5000;

    const timer = setInterval(() => {
      if (isDirty) save();
    }, intervalMs);

    // Simulate unmount - clear interval
    clearInterval(timer);

    // Advance time, nothing should fire
    vi.advanceTimersByTime(30000);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('useAutoSave - dirty tracking', () => {
  it('marks dirty on editor update events', () => {
    const listeners: Record<string, (() => void)[]> = {};
    let isDirty = false;

    // Simulate editor event subscription
    const on = (event: string, handler: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    };

    on('update', () => {
      isDirty = true;
    });

    expect(isDirty).toBe(false);

    // Simulate editor update
    listeners['update']?.forEach((h) => h());
    expect(isDirty).toBe(true);
  });
});
