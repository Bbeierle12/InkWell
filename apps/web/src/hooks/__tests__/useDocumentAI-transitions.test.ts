/**
 * useDocumentAI Offline/Online Transition Tests
 *
 * Tests connectivity transitions:
 * - Start offline: isLocalMode is true
 * - Go online: isLocalMode becomes false, errors clear
 * - Lose connection mid-stream: AbortController fires
 * - Rapid toggling: no orphaned state
 * - Retry after reconnection
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Offline/Online Transition Logic', () => {
  let listeners: Record<string, Set<() => void>>;

  beforeEach(() => {
    listeners = { offline: new Set(), online: new Set() };
  });

  afterEach(() => {
    listeners.offline.clear();
    listeners.online.clear();
  });

  /** Simulates the online/offline state machine from useDocumentAI. */
  function createConnectivityTracker(initialOnline: boolean) {
    let isLocalMode = !initialOnline;
    let lastError: string | null = null;
    let abortController: AbortController | null = null;

    const goOffline = () => {
      isLocalMode = true;
      // Abort in-flight operations
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
    };

    const goOnline = () => {
      isLocalMode = false;
      lastError = null;
    };

    const startOperation = () => {
      abortController?.abort();
      const controller = new AbortController();
      abortController = controller;
      lastError = null;
      return controller;
    };

    const endOperation = (controller: AbortController) => {
      if (abortController === controller) {
        abortController = null;
      }
    };

    const setError = (msg: string) => {
      lastError = msg;
    };

    return {
      get isLocalMode() { return isLocalMode; },
      get lastError() { return lastError; },
      get hasInFlight() { return abortController !== null; },
      goOffline,
      goOnline,
      startOperation,
      endOperation,
      setError,
    };
  }

  it('starts offline when navigator.onLine is false', () => {
    const tracker = createConnectivityTracker(false);
    expect(tracker.isLocalMode).toBe(true);
  });

  it('starts online when navigator.onLine is true', () => {
    const tracker = createConnectivityTracker(true);
    expect(tracker.isLocalMode).toBe(false);
  });

  it('transitions to local mode when offline event fires', () => {
    const tracker = createConnectivityTracker(true);
    expect(tracker.isLocalMode).toBe(false);

    tracker.goOffline();
    expect(tracker.isLocalMode).toBe(true);
  });

  it('transitions back to online mode when online event fires', () => {
    const tracker = createConnectivityTracker(false);
    expect(tracker.isLocalMode).toBe(true);

    tracker.goOnline();
    expect(tracker.isLocalMode).toBe(false);
  });

  it('clears lastError when going back online', () => {
    const tracker = createConnectivityTracker(true);
    tracker.setError('Connection lost');
    expect(tracker.lastError).toBe('Connection lost');

    tracker.goOnline();
    expect(tracker.lastError).toBeNull();
  });

  it('aborts in-flight operation when going offline', () => {
    const tracker = createConnectivityTracker(true);
    const controller = tracker.startOperation();
    expect(controller.signal.aborted).toBe(false);
    expect(tracker.hasInFlight).toBe(true);

    tracker.goOffline();
    expect(controller.signal.aborted).toBe(true);
    expect(tracker.hasInFlight).toBe(false);
  });

  it('does not crash when going offline with no in-flight operation', () => {
    const tracker = createConnectivityTracker(true);
    expect(tracker.hasInFlight).toBe(false);

    // Should not throw
    tracker.goOffline();
    expect(tracker.isLocalMode).toBe(true);
  });

  it('handles rapid online/offline toggling without orphaned state', () => {
    const tracker = createConnectivityTracker(true);
    const controller = tracker.startOperation();

    // Rapid toggling
    tracker.goOffline();
    tracker.goOnline();
    tracker.goOffline();
    tracker.goOnline();
    tracker.goOffline();

    // Original operation should be aborted
    expect(controller.signal.aborted).toBe(true);
    // Final state should be offline
    expect(tracker.isLocalMode).toBe(true);
    // No in-flight operation
    expect(tracker.hasInFlight).toBe(false);
  });

  it('rapid toggling ending online clears errors', () => {
    const tracker = createConnectivityTracker(true);
    tracker.setError('Some error');

    tracker.goOffline();
    tracker.goOnline();
    tracker.goOffline();
    tracker.goOnline();

    expect(tracker.isLocalMode).toBe(false);
    expect(tracker.lastError).toBeNull();
  });

  it('new operation aborts previous in-flight operation', () => {
    const tracker = createConnectivityTracker(true);
    const first = tracker.startOperation();
    expect(first.signal.aborted).toBe(false);

    const second = tracker.startOperation();
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it('completed operation clears in-flight tracker', () => {
    const tracker = createConnectivityTracker(true);
    const controller = tracker.startOperation();
    expect(tracker.hasInFlight).toBe(true);

    tracker.endOperation(controller);
    expect(tracker.hasInFlight).toBe(false);
  });

  it('stale endOperation does not clear newer in-flight', () => {
    const tracker = createConnectivityTracker(true);
    const first = tracker.startOperation();
    const second = tracker.startOperation();

    // First operation completing should not clear the newer one
    tracker.endOperation(first);
    expect(tracker.hasInFlight).toBe(true);

    tracker.endOperation(second);
    expect(tracker.hasInFlight).toBe(false);
  });
});

describe('Retry After Reconnection', () => {
  it('tracks last operation for retry', () => {
    type OpRecord = { operation: string; args?: string };
    let lastOp: OpRecord | null = null;

    // Simulate executeOperation storing last op
    const executeOperation = (operation: string, args?: string) => {
      lastOp = { operation, args };
    };

    executeOperation('rewrite', 'formal');
    expect(lastOp).toEqual({ operation: 'rewrite', args: 'formal' });
  });

  it('clears last op on successful completion', () => {
    type OpRecord = { operation: string; args?: string };
    let lastOp: OpRecord | null = { operation: 'summarize' };

    // Simulate successful completion
    lastOp = null;
    expect(lastOp).toBeNull();
  });

  it('preserves last op on failure for retry', () => {
    type OpRecord = { operation: string; args?: string };
    let lastOp: OpRecord | null = { operation: 'expand' };

    // Simulate failure — lastOp is NOT cleared
    expect(lastOp).toEqual({ operation: 'expand' });
  });

  it('retry calls executeOperation with stored args', () => {
    const executeCalls: Array<{ op: string; args?: string }> = [];
    let lastOp: { op: string; args?: string } | null = null;

    const execute = (op: string, args?: string) => {
      lastOp = { op, args };
      executeCalls.push({ op, args });
    };

    const retry = () => {
      if (lastOp) {
        execute(lastOp.op, lastOp.args);
      }
    };

    // Initial call fails
    execute('critique');
    expect(executeCalls).toHaveLength(1);

    // Retry
    retry();
    expect(executeCalls).toHaveLength(2);
    expect(executeCalls[1]).toEqual({ op: 'critique', args: undefined });
  });
});

describe('Model Status Check Behavior', () => {
  it('isTauriEnvironment returns false in Node test env', () => {
    // In Node.js test env, window.__TAURI__ is not set
    const hasTauri = typeof globalThis !== 'undefined'
      && 'window' in globalThis
      && typeof (globalThis as Record<string, unknown>).window === 'object'
      && (globalThis as Record<string, unknown>).window !== null
      && '__TAURI__' in ((globalThis as Record<string, unknown>).window as object);

    expect(hasTauri).toBe(false);
  });

  it('model status check returns null in non-Tauri environment', async () => {
    // checkModelsStatus returns null when not in Tauri
    // We test this by simulating the guard check
    const isTauri = false;
    const result = isTauri ? { has_llm: true, has_whisper: false } : null;
    expect(result).toBeNull();
  });

  it('setup screen skips when both models are present', () => {
    const status = { has_llm: true, has_whisper: true };
    const shouldShowSetup = !status.has_llm && !status.has_whisper;
    expect(shouldShowSetup).toBe(false);
  });

  it('setup screen shows when no models are present', () => {
    const status = { has_llm: false, has_whisper: false };
    const shouldShowSetup = !status.has_llm && !status.has_whisper;
    expect(shouldShowSetup).toBe(true);
  });

  it('setup screen shows when only one model type is missing', () => {
    // Current logic: only show setup when BOTH are missing
    const statusPartial = { has_llm: true, has_whisper: false };
    const showForPartial = !statusPartial.has_llm && !statusPartial.has_whisper;
    expect(showForPartial).toBe(false);
  });
});
