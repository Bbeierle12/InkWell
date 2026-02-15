/**
 * Audio Capture Utility Tests
 *
 * Tests microphone capture, chunk concatenation, and resource cleanup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Track calls for assertions
let stopTrackCalls: number;
let closeCalls: number;
let disconnectCalls: number;
let audioProcessCallback: ((event: any) => void) | null;

function setupMocks() {
  stopTrackCalls = 0;
  closeCalls = 0;
  disconnectCalls = 0;
  audioProcessCallback = null;

  const mockConnect = vi.fn();
  const mockDisconnect = vi.fn(() => { disconnectCalls++; });

  const MockAudioContext = vi.fn().mockImplementation(() => ({
    sampleRate: 16000,
    createMediaStreamSource: vi.fn(() => ({
      connect: mockConnect,
      disconnect: mockDisconnect,
    })),
    createScriptProcessor: vi.fn(() => {
      const node: any = {
        connect: mockConnect,
        disconnect: mockDisconnect,
        _onaudioprocess: null,
      };
      Object.defineProperty(node, 'onaudioprocess', {
        set: (fn: any) => {
          node._onaudioprocess = fn;
          audioProcessCallback = fn;
        },
        get: () => node._onaudioprocess,
      });
      return node;
    }),
    destination: {},
    close: vi.fn().mockImplementation(() => {
      closeCalls++;
      return Promise.resolve();
    }),
  }));

  const mockGetUserMedia = vi.fn().mockResolvedValue({
    getTracks: () => [{ stop: () => { stopTrackCalls++; } }],
  });

  vi.stubGlobal('AudioContext', MockAudioContext);
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: mockGetUserMedia },
  });

  return { mockGetUserMedia };
}

describe('audio-capture', () => {
  let mockGetUserMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    const mocks = setupMocks();
    mockGetUserMedia = mocks.mockGetUserMedia;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requests mono 16kHz audio from getUserMedia', async () => {
    const { startAudioCapture } = await import('../audio-capture');
    await startAudioCapture();

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
      },
    });
  });

  it('concatenates chunks on stop', async () => {
    const { startAudioCapture } = await import('../audio-capture');
    const session = await startAudioCapture();

    // Simulate audio data arriving
    const chunk1 = new Float32Array([0.1, 0.2]);
    const chunk2 = new Float32Array([0.3, 0.4]);

    if (audioProcessCallback) {
      audioProcessCallback({
        inputBuffer: { getChannelData: () => chunk1 },
      });
      audioProcessCallback({
        inputBuffer: { getChannelData: () => chunk2 },
      });
    }

    const result = session.stop();
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(4);
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[3]).toBeCloseTo(0.4);
  });

  it('releases resources on stop', async () => {
    const { startAudioCapture } = await import('../audio-capture');
    const session = await startAudioCapture();

    session.stop();

    expect(stopTrackCalls).toBe(1);
    expect(closeCalls).toBe(1);
    expect(disconnectCalls).toBeGreaterThan(0);
  });

  it('releases resources on cancel', async () => {
    const { startAudioCapture } = await import('../audio-capture');
    const session = await startAudioCapture();

    session.cancel();

    expect(stopTrackCalls).toBe(1);
    expect(closeCalls).toBe(1);
    expect(disconnectCalls).toBeGreaterThan(0);
  });

  it('throws when getUserMedia is denied', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'));

    const { startAudioCapture } = await import('../audio-capture');
    await expect(startAudioCapture()).rejects.toThrow('Permission denied');
  });
});
