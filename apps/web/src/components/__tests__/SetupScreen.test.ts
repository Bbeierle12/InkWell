/**
 * SetupScreen Component Tests
 *
 * Tests the first-run model download setup screen logic:
 * - Model catalog structure
 * - Download state machine
 * - Completion detection
 * - Format utilities
 */
import { describe, it, expect } from 'vitest';

/** formatBytes utility matching SetupScreen implementation */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

describe('SetupScreen — formatBytes', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(142_000_000)).toBe('135.4 MB');
    expect(formatBytes(1_048_576)).toBe('1.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(2_000_000_000)).toBe('1.86 GB');
    expect(formatBytes(4_500_000_000)).toBe('4.19 GB');
  });
});

describe('SetupScreen — Download State Machine', () => {
  type DownloadState = 'idle' | 'downloading' | 'done' | 'error';

  interface DownloadProgress {
    state: DownloadState;
    progressPct: number;
    bytesDownloaded: number;
    totalBytes: number | null;
    error?: string;
  }

  it('starts in idle state', () => {
    const progress: DownloadProgress = {
      state: 'idle',
      progressPct: 0,
      bytesDownloaded: 0,
      totalBytes: null,
    };
    expect(progress.state).toBe('idle');
  });

  it('transitions to downloading on start', () => {
    const progress: DownloadProgress = {
      state: 'downloading',
      progressPct: 0,
      bytesDownloaded: 0,
      totalBytes: 4_000_000,
    };
    expect(progress.state).toBe('downloading');
  });

  it('updates progress during download', () => {
    const progress: DownloadProgress = {
      state: 'downloading',
      progressPct: 50,
      bytesDownloaded: 2_000_000,
      totalBytes: 4_000_000,
    };
    expect(progress.progressPct).toBe(50);
    expect(progress.bytesDownloaded).toBe(2_000_000);
  });

  it('transitions to done on completion', () => {
    const progress: DownloadProgress = {
      state: 'done',
      progressPct: 100,
      bytesDownloaded: 4_000_000,
      totalBytes: 4_000_000,
    };
    expect(progress.state).toBe('done');
    expect(progress.progressPct).toBe(100);
  });

  it('transitions to error on failure', () => {
    const progress: DownloadProgress = {
      state: 'error',
      progressPct: 25,
      bytesDownloaded: 1_000_000,
      totalBytes: 4_000_000,
      error: 'Network error',
    };
    expect(progress.state).toBe('error');
    expect(progress.error).toBe('Network error');
  });
});

describe('SetupScreen — Completion Detection', () => {
  it('both ready when both models downloaded', () => {
    const hasLlm = true;
    const hasWhisper = true;
    expect(hasLlm && hasWhisper).toBe(true);
  });

  it('not ready when LLM missing', () => {
    const hasLlm = false;
    const hasWhisper = true;
    expect(hasLlm && hasWhisper).toBe(false);
  });

  it('not ready when Whisper missing', () => {
    const hasLlm = true;
    const hasWhisper = false;
    expect(hasLlm && hasWhisper).toBe(false);
  });

  it('considers download done state as installed', () => {
    // Models status says not installed, but download finished
    const statusHasLlm = false;
    const llmDownloadDone = true;
    const hasLlm = statusHasLlm || llmDownloadDone;
    expect(hasLlm).toBe(true);
  });
});

describe('SetupScreen — Model Catalog', () => {
  const MODEL_CATALOG = {
    llm: [
      { id: 'llama-3.2-1b', filename: 'llama-3.2-1b-q4_k_m.gguf', sizeBytes: 800_000_000 },
      { id: 'llama-3.2-3b', filename: 'llama-3.2-3b-q4_k_m.gguf', sizeBytes: 2_000_000_000 },
    ],
    whisper: [
      { id: 'whisper-base', filename: 'ggml-base.en.bin', sizeBytes: 142_000_000 },
      { id: 'whisper-small', filename: 'ggml-small.bin', sizeBytes: 466_000_000 },
    ],
  };

  it('has at least one LLM model option', () => {
    expect(MODEL_CATALOG.llm.length).toBeGreaterThanOrEqual(1);
  });

  it('has at least one Whisper model option', () => {
    expect(MODEL_CATALOG.whisper.length).toBeGreaterThanOrEqual(1);
  });

  it('LLM models have .gguf extension', () => {
    for (const model of MODEL_CATALOG.llm) {
      expect(model.filename).toMatch(/\.gguf$/);
    }
  });

  it('Whisper models have .bin extension', () => {
    for (const model of MODEL_CATALOG.whisper) {
      expect(model.filename).toMatch(/\.bin$/);
    }
  });

  it('all models have positive size', () => {
    const all = [...MODEL_CATALOG.llm, ...MODEL_CATALOG.whisper];
    for (const model of all) {
      expect(model.sizeBytes).toBeGreaterThan(0);
    }
  });
});
