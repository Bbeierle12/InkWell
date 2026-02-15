'use client';

/**
 * SetupScreen — First-run model download experience.
 *
 * Shown when the desktop app launches and local models are not yet installed.
 * Provides model selection, download with progress, and transition to the editor.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  isTauriEnvironment,
  checkModelsStatus,
  downloadModel,
  type ModelsStatus,
} from '@/lib/tauri-bridge';

/** Predefined model catalog for the setup wizard. */
const MODEL_CATALOG = {
  llm: [
    {
      id: 'llama-3.2-1b',
      name: 'Llama 3.2 1B (Recommended)',
      filename: 'llama-3.2-1b-q4_k_m.gguf',
      size: '0.8 GB',
      sizeBytes: 800_000_000,
      url: '', // Populated at build time or by user
      description: 'Fast, lightweight model for inline suggestions and rewrites.',
    },
    {
      id: 'llama-3.2-3b',
      name: 'Llama 3.2 3B',
      filename: 'llama-3.2-3b-q4_k_m.gguf',
      size: '2.0 GB',
      sizeBytes: 2_000_000_000,
      url: '',
      description: 'Higher quality for summarization and critique.',
    },
  ],
  whisper: [
    {
      id: 'whisper-base',
      name: 'Whisper Base (Recommended)',
      filename: 'ggml-base.en.bin',
      size: '142 MB',
      sizeBytes: 142_000_000,
      url: '',
      description: 'Fast English speech-to-text for voice input.',
    },
    {
      id: 'whisper-small',
      name: 'Whisper Small',
      filename: 'ggml-small.bin',
      size: '466 MB',
      sizeBytes: 466_000_000,
      url: '',
      description: 'Multi-language, higher accuracy transcription.',
    },
  ],
} as const;

type DownloadState = 'idle' | 'downloading' | 'done' | 'error';

interface DownloadProgress {
  state: DownloadState;
  progressPct: number;
  bytesDownloaded: number;
  totalBytes: number | null;
  error?: string;
}

interface SetupScreenProps {
  onComplete: () => void;
}

export function SetupScreen({ onComplete }: SetupScreenProps) {
  const [modelsStatus, setModelsStatus] = useState<ModelsStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedLlm, setSelectedLlm] = useState<string>(MODEL_CATALOG.llm[0].id);
  const [selectedWhisper, setSelectedWhisper] = useState<string>(MODEL_CATALOG.whisper[0].id);

  const [llmDownload, setLlmDownload] = useState<DownloadProgress>({
    state: 'idle',
    progressPct: 0,
    bytesDownloaded: 0,
    totalBytes: null,
  });
  const [whisperDownload, setWhisperDownload] = useState<DownloadProgress>({
    state: 'idle',
    progressPct: 0,
    bytesDownloaded: 0,
    totalBytes: null,
  });

  // Check model status on mount
  useEffect(() => {
    async function check() {
      const status = await checkModelsStatus();
      setModelsStatus(status);
      setLoading(false);

      // If both model types already installed, skip setup
      if (status?.has_llm && status?.has_whisper) {
        onComplete();
      }
    }
    check();
  }, [onComplete]);

  const handleDownloadLlm = useCallback(async () => {
    const model = MODEL_CATALOG.llm.find((m) => m.id === selectedLlm);
    if (!model || !model.url) {
      setLlmDownload((p) => ({
        ...p,
        state: 'error',
        error: 'No download URL configured. Place the model file manually in the models directory.',
      }));
      return;
    }

    setLlmDownload({ state: 'downloading', progressPct: 0, bytesDownloaded: 0, totalBytes: null });

    const result = await downloadModel(model.url, model.filename, (event) => {
      if (event.error) {
        setLlmDownload((p) => ({ ...p, state: 'error', error: event.error! }));
      } else {
        setLlmDownload((p) => ({
          ...p,
          progressPct: event.progress_pct ?? p.progressPct,
          bytesDownloaded: event.bytes_downloaded,
          totalBytes: event.total_bytes,
          state: event.done ? 'done' : 'downloading',
        }));
      }
    });

    if (!result) {
      setLlmDownload((p) => ({
        ...p,
        state: p.state === 'error' ? 'error' : 'error',
        error: p.error ?? 'Download failed',
      }));
    }
  }, [selectedLlm]);

  const handleDownloadWhisper = useCallback(async () => {
    const model = MODEL_CATALOG.whisper.find((m) => m.id === selectedWhisper);
    if (!model || !model.url) {
      setWhisperDownload((p) => ({
        ...p,
        state: 'error',
        error: 'No download URL configured. Place the model file manually in the models directory.',
      }));
      return;
    }

    setWhisperDownload({ state: 'downloading', progressPct: 0, bytesDownloaded: 0, totalBytes: null });

    const result = await downloadModel(model.url, model.filename, (event) => {
      if (event.error) {
        setWhisperDownload((p) => ({ ...p, state: 'error', error: event.error! }));
      } else {
        setWhisperDownload((p) => ({
          ...p,
          progressPct: event.progress_pct ?? p.progressPct,
          bytesDownloaded: event.bytes_downloaded,
          totalBytes: event.total_bytes,
          state: event.done ? 'done' : 'downloading',
        }));
      }
    });

    if (!result) {
      setWhisperDownload((p) => ({
        ...p,
        state: p.state === 'error' ? 'error' : 'error',
        error: p.error ?? 'Download failed',
      }));
    }
  }, [selectedWhisper]);

  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const handleRefreshStatus = useCallback(async () => {
    const status = await checkModelsStatus();
    setModelsStatus(status);
    if (status?.has_llm && status?.has_whisper) {
      onComplete();
    }
  }, [onComplete]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Checking local models...</p>
      </div>
    );
  }

  const hasLlm = modelsStatus?.has_llm || llmDownload.state === 'done';
  const hasWhisper = modelsStatus?.has_whisper || whisperDownload.state === 'done';
  const bothReady = hasLlm && hasWhisper;

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Welcome to Inkwell
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Set up local AI models for offline writing assistance.
          </p>
        </div>

        {modelsStatus && (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Models directory: <code className="text-xs">{modelsStatus.models_dir}</code>
          </p>
        )}

        {/* LLM Model Section */}
        <div className="border rounded-lg p-6 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-2 dark:text-gray-200">
            Language Model (LLM)
            {hasLlm && <span className="ml-2 text-green-600 text-sm">Installed</span>}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Powers inline suggestions, rewriting, and AI operations.
          </p>

          {!hasLlm && (
            <>
              <select
                className="w-full border rounded p-2 mb-2 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                value={selectedLlm}
                onChange={(e) => setSelectedLlm(e.target.value)}
                disabled={llmDownload.state === 'downloading'}
              >
                {MODEL_CATALOG.llm.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.size})
                  </option>
                ))}
              </select>

              <p className="text-xs text-gray-400 mb-3">
                {MODEL_CATALOG.llm.find((m) => m.id === selectedLlm)?.description}
              </p>

              {llmDownload.state === 'idle' && (
                <button
                  className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                  onClick={handleDownloadLlm}
                >
                  Download
                </button>
              )}

              {llmDownload.state === 'downloading' && (
                <div>
                  <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${llmDownload.progressPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {Math.round(llmDownload.progressPct)}% — {formatBytes(llmDownload.bytesDownloaded)}
                    {llmDownload.totalBytes && ` / ${formatBytes(llmDownload.totalBytes)}`}
                  </p>
                </div>
              )}

              {llmDownload.state === 'error' && (
                <p className="text-sm text-red-600">{llmDownload.error}</p>
              )}
            </>
          )}
        </div>

        {/* Whisper Model Section */}
        <div className="border rounded-lg p-6 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-2 dark:text-gray-200">
            Speech Model (Whisper)
            {hasWhisper && <span className="ml-2 text-green-600 text-sm">Installed</span>}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Enables voice-to-text dictation and voice commands.
          </p>

          {!hasWhisper && (
            <>
              <select
                className="w-full border rounded p-2 mb-2 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                value={selectedWhisper}
                onChange={(e) => setSelectedWhisper(e.target.value)}
                disabled={whisperDownload.state === 'downloading'}
              >
                {MODEL_CATALOG.whisper.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.size})
                  </option>
                ))}
              </select>

              <p className="text-xs text-gray-400 mb-3">
                {MODEL_CATALOG.whisper.find((m) => m.id === selectedWhisper)?.description}
              </p>

              {whisperDownload.state === 'idle' && (
                <button
                  className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                  onClick={handleDownloadWhisper}
                >
                  Download
                </button>
              )}

              {whisperDownload.state === 'downloading' && (
                <div>
                  <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${whisperDownload.progressPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {Math.round(whisperDownload.progressPct)}% — {formatBytes(whisperDownload.bytesDownloaded)}
                    {whisperDownload.totalBytes && ` / ${formatBytes(whisperDownload.totalBytes)}`}
                  </p>
                </div>
              )}

              {whisperDownload.state === 'error' && (
                <p className="text-sm text-red-600">{whisperDownload.error}</p>
              )}
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center">
          {bothReady ? (
            <button
              className="bg-green-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-green-700"
              onClick={onComplete}
            >
              Start Writing
            </button>
          ) : (
            <>
              <button
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                onClick={handleSkip}
              >
                Skip Setup
              </button>
              <button
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                onClick={handleRefreshStatus}
              >
                Refresh Status
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center">
          You can also place model files manually in the models directory.
          LLM models use .gguf format, Whisper models use .bin format.
        </p>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
