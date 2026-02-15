/**
 * Tauri Bridge Voice Command Tests
 *
 * Tests transcribeAudioBytes returns null when not in Tauri.
 * Follows the same pattern as tauri-bridge.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('tauri-bridge voice commands', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    if (typeof globalThis.window === 'undefined') {
      // @ts-expect-error - setting up window for tests
      globalThis.window = {};
    }
    // @ts-expect-error - cleanup
    delete globalThis.window.__TAURI__;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      // @ts-expect-error - cleanup
      delete globalThis.window;
    }
    vi.resetModules();
  });

  it('transcribeAudioBytes returns null when not in Tauri', async () => {
    const { transcribeAudioBytes } = await import('../tauri-bridge');
    const samples = new Float32Array([0.1, 0.2, 0.3]);
    const result = await transcribeAudioBytes(samples);
    expect(result).toBeNull();
  });

  it('transcribeAudioBytes returns null with language param when not in Tauri', async () => {
    const { transcribeAudioBytes } = await import('../tauri-bridge');
    const samples = new Float32Array([0.1, 0.2, 0.3]);
    const result = await transcribeAudioBytes(samples, 'en');
    expect(result).toBeNull();
  });
});
