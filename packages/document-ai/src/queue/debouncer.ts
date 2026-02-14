/**
 * Debouncer
 *
 * Collapses rapid-fire requests within a configurable time window.
 * Only the latest request within the window actually executes.
 */
import { DEBOUNCE_MS } from '@inkwell/shared';

export type DebouncedCallback<T> = (value: T) => void;

export class Debouncer<T = unknown> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private windowMs: number;

  constructor(windowMs: number = DEBOUNCE_MS) {
    this.windowMs = windowMs;
  }

  /**
   * Schedule a value to be emitted after the debounce window.
   * If called again before the window expires, the previous
   * pending value is discarded and the timer restarts.
   *
   * @param value  The latest value
   * @param callback  Invoked with the value after the window
   */
  schedule(value: T, callback: DebouncedCallback<T>): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = null;
      callback(value);
    }, this.windowMs);
  }

  /**
   * Cancel any pending debounced invocation.
   */
  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Check if a debounced invocation is pending.
   */
  get pending(): boolean {
    return this.timer !== null;
  }

  /**
   * Clean up the debouncer, cancelling any pending timer.
   * Alias for cancel() — used during teardown.
   */
  teardown(): void {
    this.cancel();
  }
}
