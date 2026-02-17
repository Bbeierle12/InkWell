/**
 * Workspace Watch Tool
 *
 * MCP tool that monitors workspace files for changes.
 */

import { FileWatcher } from '../indexer/file-watcher';

let watcher: FileWatcher | null = null;

/**
 * Start watching the workspace for file changes.
 *
 * Registers each pattern as a watch directory. A module-level
 * FileWatcher singleton is created lazily when no explicit watcher
 * is provided.
 *
 * @param patterns     Array of directory paths / glob patterns to watch.
 * @param fileWatcher  Optional FileWatcher instance (for testing / DI).
 */
export function workspaceWatch(
  patterns: string[],
  fileWatcher?: FileWatcher,
  onChange?: (path: string) => void,
): void {
  const fw = fileWatcher ?? (watcher ??= new FileWatcher());
  for (const pattern of patterns) {
    fw.watch(pattern, (path) => {
      onChange?.(path);
    });
  }
}
