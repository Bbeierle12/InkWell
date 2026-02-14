/**
 * File Watcher
 *
 * Monitors workspace files using fsnotify-based watching
 * and triggers re-indexing on changes.
 */

import { type FSWatcher, watch as nodeWatch } from 'fs';
import { join } from 'path';

/** Minimal interface for the fs module's watch function. */
export interface FsWatchModule {
  watch: typeof nodeWatch;
}

export class FileWatcher {
  private watchers: Map<string, FSWatcher> = new Map();
  private readonly fsModule: FsWatchModule;

  /**
   * Create a FileWatcher.
   * @param fsModule - An object providing an `fs.watch`-compatible function.
   *                   Defaults to Node's built-in `fs` module.
   */
  constructor(fsModule?: { watch: typeof nodeWatch }) {
    this.fsModule = fsModule ?? { watch: nodeWatch };
  }

  /**
   * Start watching the given directory for changes.
   * Calls `onChange` with the full path whenever a file change is detected.
   *
   * If the directory is already being watched, the existing watcher is
   * closed and replaced.
   *
   * @param directory - Absolute path to the directory to watch.
   * @param onChange  - Callback invoked with the full path of the changed file.
   */
  watch(directory: string, onChange: (path: string) => void): void {
    // If already watching this directory, close the old watcher first.
    this.stopOne(directory);

    try {
      const watcher = this.fsModule.watch(
        directory,
        { recursive: true },
        (_eventType: string, filename: string | null) => {
          if (filename) {
            const fullPath = join(directory, filename);
            onChange(fullPath);
          }
        },
      );

      this.watchers.set(directory, watcher);
    } catch (error: unknown) {
      // Gracefully handle errors such as non-existent directories.
      // The watcher simply won't be registered.
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(`FileWatcher: failed to watch "${directory}": ${message}`);
    }
  }

  /**
   * Stop watching a single directory.
   * No-op if the directory is not currently being watched.
   *
   * @param directory - The directory to stop watching.
   */
  stopOne(directory: string): void {
    const watcher = this.watchers.get(directory);
    if (watcher) {
      watcher.close();
      this.watchers.delete(directory);
    }
  }

  /**
   * Stop all file watchers and clear the internal registry.
   */
  stop(): void {
    for (const [, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
  }
}
