/**
 * Backpressure Manager
 *
 * Manages "suggestions paused" state when the system is overloaded.
 */

export class BackpressureManager {
  private _paused = false;
  private _callback: ((paused: boolean) => void) | null = null;

  get isPaused(): boolean {
    return this._paused;
  }

  /**
   * Register a callback that fires whenever pause() or resume() is called.
   * Replaces any previously registered callback.
   */
  onStateChange(callback: (paused: boolean) => void): void {
    this._callback = callback;
  }

  /**
   * Activate backpressure (pause suggestions).
   */
  pause(): void {
    this._paused = true;
    this._callback?.(true);
  }

  /**
   * Deactivate backpressure (resume suggestions).
   */
  resume(): void {
    this._paused = false;
    this._callback?.(false);
  }
}
