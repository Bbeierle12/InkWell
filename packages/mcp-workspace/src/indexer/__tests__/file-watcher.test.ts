import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileWatcher } from '../file-watcher';

/**
 * FileWatcher unit tests.
 *
 * Uses a mock fs module so we can precisely control when and how
 * watch events fire without touching the real filesystem.
 */

/** Helper: create a mock FSWatcher object. */
function createMockWatcher() {
  return { close: vi.fn() };
}

/**
 * Helper: build a mock fs module whose `watch` invokes the listener
 * with the given events (each an [eventType, filename] pair) on the
 * next microtask tick.
 */
function createMockFs(
  events: Array<[string, string | null]> = [],
  watcher = createMockWatcher(),
) {
  const watch = vi.fn(
    (
      _dir: string,
      _opts: { recursive: boolean },
      cb: (eventType: string, filename: string | null) => void,
    ) => {
      for (const [eventType, filename] of events) {
        setTimeout(() => cb(eventType, filename), 0);
      }
      return watcher;
    },
  );
  return { watch, watcher };
}

describe('FileWatcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------
  // 1. onChange fires on regular file change events
  // ---------------------------------------------------------------
  it('should call onChange when file changes are detected', async () => {
    const mockWatcher = createMockWatcher();
    const { watch } = createMockFs([['change', 'test.txt']], mockWatcher);

    const fw = new FileWatcher({ watch } as any);
    const onChange = vi.fn();

    fw.watch('/workspace', onChange);

    // Allow the setTimeout callbacks to fire
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    // The callback should receive the *full* path (directory + filename)
    expect(onChange).toHaveBeenCalledWith(
      expect.stringContaining('test.txt'),
    );
  });

  // ---------------------------------------------------------------
  // 2. File creation events
  // ---------------------------------------------------------------
  it('should handle file creation events', async () => {
    const mockWatcher = createMockWatcher();
    const { watch } = createMockFs([['rename', 'new-file.md']], mockWatcher);

    const fw = new FileWatcher({ watch } as any);
    const onChange = vi.fn();

    fw.watch('/workspace', onChange);

    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.stringContaining('new-file.md'),
    );
  });

  // ---------------------------------------------------------------
  // 3. File deletion events (also surfaced as 'rename' by Node)
  // ---------------------------------------------------------------
  it('should handle file deletion events', async () => {
    const mockWatcher = createMockWatcher();
    const { watch } = createMockFs(
      [['rename', 'deleted-file.ts']],
      mockWatcher,
    );

    const fw = new FileWatcher({ watch } as any);
    const onChange = vi.fn();

    fw.watch('/workspace', onChange);

    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    expect(onChange).toHaveBeenCalledWith(
      expect.stringContaining('deleted-file.ts'),
    );
  });

  // ---------------------------------------------------------------
  // 4. stop() closes every watcher
  // ---------------------------------------------------------------
  it('should stop all watchers on stop()', () => {
    const watcher1 = createMockWatcher();
    const watcher2 = createMockWatcher();

    // First call returns watcher1, second call returns watcher2
    let callCount = 0;
    const watch = vi.fn(() => {
      callCount++;
      return callCount === 1 ? watcher1 : watcher2;
    });

    const fw = new FileWatcher({ watch } as any);
    fw.watch('/dir-a', vi.fn());
    fw.watch('/dir-b', vi.fn());

    fw.stop();

    expect(watcher1.close).toHaveBeenCalledTimes(1);
    expect(watcher2.close).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------
  // 5. Non-existent directory is handled gracefully (no crash)
  // ---------------------------------------------------------------
  it('should handle non-existent directory gracefully', () => {
    const watch = vi.fn(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    // Suppress the expected console.error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fw = new FileWatcher({ watch } as any);

    // Should not throw
    expect(() => fw.watch('/nonexistent', vi.fn())).not.toThrow();

    // The error message should have been logged
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to watch'),
    );

    // stop() should still work without errors
    expect(() => fw.stop()).not.toThrow();
  });

  // ---------------------------------------------------------------
  // 6. Multiple independent watchers
  // ---------------------------------------------------------------
  it('should support multiple independent watchers', async () => {
    const onChangeA = vi.fn();
    const onChangeB = vi.fn();

    const watcherA = createMockWatcher();
    const watcherB = createMockWatcher();

    let callIdx = 0;
    const watch = vi.fn(
      (
        _dir: string,
        _opts: { recursive: boolean },
        cb: (eventType: string, filename: string | null) => void,
      ) => {
        callIdx++;
        if (callIdx === 1) {
          setTimeout(() => cb('change', 'a.txt'), 0);
          return watcherA;
        }
        setTimeout(() => cb('change', 'b.txt'), 0);
        return watcherB;
      },
    );

    const fw = new FileWatcher({ watch } as any);
    fw.watch('/project-a', onChangeA);
    fw.watch('/project-b', onChangeB);

    await vi.waitFor(() => {
      expect(onChangeA).toHaveBeenCalledTimes(1);
      expect(onChangeB).toHaveBeenCalledTimes(1);
    });

    // Each callback receives the path scoped to its directory
    expect(onChangeA).toHaveBeenCalledWith(
      expect.stringContaining('a.txt'),
    );
    expect(onChangeB).toHaveBeenCalledWith(
      expect.stringContaining('b.txt'),
    );

    // stopOne only closes one watcher
    fw.stopOne('/project-a');
    expect(watcherA.close).toHaveBeenCalledTimes(1);
    expect(watcherB.close).not.toHaveBeenCalled();

    // stop() closes the remaining watcher
    fw.stop();
    expect(watcherB.close).toHaveBeenCalledTimes(1);
  });
});
