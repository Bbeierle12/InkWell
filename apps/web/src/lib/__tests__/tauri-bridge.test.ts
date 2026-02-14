/**
 * Tauri Bridge Tests
 *
 * Tests environment detection and null-safe behavior when not in Tauri.
 * These tests run in a standard Node/vitest environment (no __TAURI__ global).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to mock the module since it checks window.__TAURI__
// In non-Tauri environments, all functions should return null/false.

describe('tauri-bridge', () => {
  // Store original window
  const originalWindow = globalThis.window;

  beforeEach(() => {
    // Ensure clean state with no __TAURI__
    if (typeof globalThis.window === 'undefined') {
      // @ts-expect-error - setting up window for tests
      globalThis.window = {};
    }
    // Make sure __TAURI__ is not present
    // @ts-expect-error - cleanup
    delete globalThis.window.__TAURI__;
  });

  afterEach(() => {
    // Restore window
    if (originalWindow === undefined) {
      // @ts-expect-error - cleanup
      delete globalThis.window;
    }
    vi.resetModules();
  });

  it('isTauriEnvironment returns false when __TAURI__ is not present', async () => {
    const { isTauriEnvironment } = await import('../tauri-bridge');
    expect(isTauriEnvironment()).toBe(false);
  });

  it('isTauriEnvironment returns true when __TAURI__ is present', async () => {
    // @ts-expect-error - simulating Tauri environment
    globalThis.window.__TAURI__ = {};
    const { isTauriEnvironment } = await import('../tauri-bridge');
    expect(isTauriEnvironment()).toBe(true);
  });

  it('invokeLocalInference returns null when not in Tauri', async () => {
    const { invokeLocalInference } = await import('../tauri-bridge');
    const result = await invokeLocalInference('test prompt', 100);
    expect(result).toBeNull();
  });

  it('streamLocalInference returns null when not in Tauri', async () => {
    const { streamLocalInference } = await import('../tauri-bridge');
    const onToken = vi.fn();
    const result = await streamLocalInference('test prompt', 100, onToken);
    expect(result).toBeNull();
    expect(onToken).not.toHaveBeenCalled();
  });

  it('loadLlmModel returns null when not in Tauri', async () => {
    const { loadLlmModel } = await import('../tauri-bridge');
    const result = await loadLlmModel('/path/to/model.gguf');
    expect(result).toBeNull();
  });

  it('unloadLlmModel returns false when not in Tauri', async () => {
    const { unloadLlmModel } = await import('../tauri-bridge');
    const result = await unloadLlmModel();
    expect(result).toBe(false);
  });

  it('loadWhisperModel returns null when not in Tauri', async () => {
    const { loadWhisperModel } = await import('../tauri-bridge');
    const result = await loadWhisperModel('/path/to/whisper.bin');
    expect(result).toBeNull();
  });

  it('unloadWhisperModel returns false when not in Tauri', async () => {
    const { unloadWhisperModel } = await import('../tauri-bridge');
    const result = await unloadWhisperModel();
    expect(result).toBe(false);
  });

  it('getSystemInfo returns null when not in Tauri', async () => {
    const { getSystemInfo } = await import('../tauri-bridge');
    const result = await getSystemInfo();
    expect(result).toBeNull();
  });
});
