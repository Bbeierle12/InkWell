/**
 * Tauri Bridge — Wrappers for Tauri invoke commands.
 *
 * Provides type-safe access to the Rust inference backends.
 * All functions return null when not running in a Tauri environment.
 */

// Tauri's invoke is only available in the desktop app context.
// We dynamically import to avoid bundling errors in web-only builds.
type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
type TauriListen = (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void>;

let cachedInvoke: TauriInvoke | null = null;
let cachedListen: TauriListen | null = null;

/**
 * Detect if we're running inside a Tauri webview.
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

async function getTauriInvoke(): Promise<TauriInvoke | null> {
  if (!isTauriEnvironment()) return null;
  if (cachedInvoke) return cachedInvoke;

  try {
    // Dynamic import to avoid bundling issues in web-only builds
    const tauri = await import('@tauri-apps/api/core');
    cachedInvoke = tauri.invoke as TauriInvoke;
    return cachedInvoke;
  } catch {
    return null;
  }
}

async function getTauriListen(): Promise<TauriListen | null> {
  if (!isTauriEnvironment()) return null;
  if (cachedListen) return cachedListen;

  try {
    const events = await import('@tauri-apps/api/event');
    cachedListen = events.listen as TauriListen;
    return cachedListen;
  } catch {
    return null;
  }
}

// ── Bridge Response Types ──

interface InferenceResponse {
  text: string;
  tokens_generated: number;
  time_ms: number;
}

interface LoadModelResponse {
  name: string;
  size_bytes: number;
  context_length: number | null;
}

interface SystemInfoResponse {
  platform: string;
  has_gpu: boolean;
  available_memory_mb: number;
}

interface StreamTokenEvent {
  token: string;
  done: boolean;
}


// ── Secure Credential Commands ──

/**
 * Get Claude API key from desktop secure credential storage.
 */
export async function getSecureClaudeApiKey(): Promise<string | null> {
  const invoke = await getTauriInvoke();
  if (!invoke) return null;

  try {
    return (await invoke('secure_get_claude_api_key')) as string | null;
  } catch {
    return null;
  }
}

/**
 * Store Claude API key in desktop secure credential storage.
 */
export async function setSecureClaudeApiKey(apiKey: string): Promise<boolean> {
  const invoke = await getTauriInvoke();
  if (!invoke) return false;

  try {
    await invoke('secure_set_claude_api_key', { apiKey });
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove Claude API key from desktop secure credential storage.
 */
export async function clearSecureClaudeApiKey(): Promise<boolean> {
  const invoke = await getTauriInvoke();
  if (!invoke) return false;

  try {
    await invoke('secure_clear_claude_api_key');
    return true;
  } catch {
    return false;
  }
}


// ── LLM Commands ──

/**
 * Load a GGUF model file for local LLM inference.
 */
export async function loadLlmModel(
  path: string,
): Promise<LoadModelResponse | null> {
  const invoke = await getTauriInvoke();
  if (!invoke) return null;

  try {
    return (await invoke('load_llm_model', { request: { path } })) as LoadModelResponse;
  } catch {
    return null;
  }
}

/**
 * Unload the current LLM model.
 */
export async function unloadLlmModel(): Promise<boolean> {
  const invoke = await getTauriInvoke();
  if (!invoke) return false;

  try {
    await invoke('unload_llm_model');
    return true;
  } catch {
    return false;
  }
}

/**
 * Invoke local inference (non-streaming).
 */
export async function invokeLocalInference(
  prompt: string,
  maxTokens: number,
  options?: { temperature?: number; topP?: number },
): Promise<InferenceResponse | null> {
  const invoke = await getTauriInvoke();
  if (!invoke) return null;

  try {
    return (await invoke('invoke_local_inference', {
      request: {
        prompt,
        max_tokens: maxTokens,
        temperature: options?.temperature,
        top_p: options?.topP,
      },
    })) as InferenceResponse;
  } catch {
    return null;
  }
}

/**
 * Stream local inference with per-token callbacks.
 *
 * Listens to 'llm-token' events emitted by the Rust backend.
 */
export async function streamLocalInference(
  prompt: string,
  maxTokens: number,
  onToken: (token: string) => void,
  options?: { temperature?: number; topP?: number },
): Promise<InferenceResponse | null> {
  const invoke = await getTauriInvoke();
  const listen = await getTauriListen();
  if (!invoke || !listen) return null;

  let unlisten: (() => void) | null = null;

  try {
    // Set up event listener before invoking
    unlisten = await listen('llm-token', (event) => {
      const payload = event.payload as StreamTokenEvent;
      if (!payload.done) {
        onToken(payload.token);
      }
    });

    // Invoke the streaming command (returns final result)
    const result = (await invoke('llm_stream', {
      request: {
        prompt,
        max_tokens: maxTokens,
        temperature: options?.temperature,
        top_p: options?.topP,
      },
    })) as InferenceResponse;

    return result;
  } catch {
    return null;
  } finally {
    unlisten?.();
  }
}

// ── Whisper Commands ──

interface TranscribeResponse {
  text: string;
  language: string;
  duration_ms: number;
}

/**
 * Transcribe audio from raw PCM f32 samples.
 *
 * Sends Float32Array data directly to the Rust backend, avoiding temp files.
 * Returns null when not running in a Tauri environment.
 */
export async function transcribeAudioBytes(
  samples: Float32Array,
  language?: string,
): Promise<TranscribeResponse | null> {
  const invoke = await getTauriInvoke();
  if (!invoke) return null;

  try {
    return (await invoke('transcribe_audio_bytes', {
      request: {
        samples: Array.from(samples),
        language,
      },
    })) as TranscribeResponse;
  } catch {
    return null;
  }
}

/**
 * Load a Whisper model file for speech-to-text.
 */
export async function loadWhisperModel(
  path: string,
): Promise<LoadModelResponse | null> {
  const invoke = await getTauriInvoke();
  if (!invoke) return null;

  try {
    return (await invoke('load_whisper_model', { request: { path } })) as LoadModelResponse;
  } catch {
    return null;
  }
}

/**
 * Unload the current Whisper model.
 */
export async function unloadWhisperModel(): Promise<boolean> {
  const invoke = await getTauriInvoke();
  if (!invoke) return false;

  try {
    await invoke('unload_whisper_model');
    return true;
  } catch {
    return false;
  }
}

// ── File Dialog Commands ──

interface FileFilter {
  name: string;
  extensions: string[];
}

/**
 * Save content to a file using a Tauri invoke command.
 * Returns the path saved to, or null if cancelled/not in Tauri.
 */
export async function saveToFile(
  content: string,
  filters: FileFilter[] = [
    { name: 'Inkwell Document', extensions: ['inkwell'] },
    { name: 'Markdown', extensions: ['md'] },
  ],
): Promise<string | null> {
  const invoke = await getTauriInvoke();
  if (!invoke) return null;

  try {
    const path = await invoke('save_file_dialog', { filters }) as string | null;
    if (!path) return null;

    await invoke('write_text_file', { path, content });
    return path;
  } catch {
    return null;
  }
}

/**
 * Open a file using a Tauri invoke command.
 * Returns the file content as a string, or null if cancelled/not in Tauri.
 */
export async function openFromFile(
  filters: FileFilter[] = [
    { name: 'Inkwell Document', extensions: ['inkwell'] },
    { name: 'Markdown', extensions: ['md'] },
  ],
): Promise<{ path: string; content: string } | null> {
  const invoke = await getTauriInvoke();
  if (!invoke) return null;

  try {
    const path = await invoke('open_file_dialog', { filters }) as string | null;
    if (!path) return null;

    const content = await invoke('read_text_file', { path }) as string;
    return { path, content };
  } catch {
    return null;
  }
}

// ── Model Management Commands ──

export interface ModelInfo {
  name: string;
  filename: string;
  size_bytes: number;
  model_type: 'llm' | 'whisper';
}

export interface ModelsStatus {
  models_dir: string;
  llm_models: ModelInfo[];
  whisper_models: ModelInfo[];
  has_llm: boolean;
  has_whisper: boolean;
}

interface DownloadProgressEvent {
  model_name: string;
  bytes_downloaded: number;
  total_bytes: number | null;
  progress_pct: number | null;
  done: boolean;
  error: string | null;
}

/**
 * Get the platform-specific models directory path.
 */
export async function getModelsDir(): Promise<string | null> {
  const invoke = await getTauriInvoke();
  if (!invoke) return null;

  try {
    return (await invoke('get_models_dir')) as string;
  } catch {
    return null;
  }
}

/**
 * Check which models are installed locally.
 */
export async function checkModelsStatus(): Promise<ModelsStatus | null> {
  const invoke = await getTauriInvoke();
  if (!invoke) return null;

  try {
    return (await invoke('check_models_status')) as ModelsStatus;
  } catch {
    return null;
  }
}

/**
 * Download a model from a URL with progress events.
 *
 * Listens to 'download-progress' events for progress updates.
 * Returns the path to the downloaded file.
 */
export async function downloadModel(
  url: string,
  filename: string,
  onProgress?: (event: DownloadProgressEvent) => void,
): Promise<string | null> {
  const invoke = await getTauriInvoke();
  const listen = await getTauriListen();
  if (!invoke) return null;

  let unlisten: (() => void) | null = null;

  try {
    if (listen && onProgress) {
      unlisten = await listen('download-progress', (event) => {
        onProgress(event.payload as DownloadProgressEvent);
      });
    }

    return (await invoke('download_model', { url, filename })) as string;
  } catch {
    return null;
  } finally {
    unlisten?.();
  }
}

// ── File-Open Pipeline Commands ──

/**
 * Get and clear the pending file path from CLI args or OS file-open events.
 * Returns null when not in Tauri or no pending file.
 */
export async function getPendingFile(): Promise<string | null> {
  const invoke = await getTauriInvoke();
  if (!invoke) return null;

  try {
    return (await invoke('get_pending_file')) as string | null;
  } catch {
    return null;
  }
}

/**
 * Listen for file-open-request events from the Rust backend.
 * These are emitted when the OS opens a file via association or deep link.
 * Returns an unlisten function, or null when not in Tauri.
 */
export async function onFileOpenRequest(
  callback: (path: string) => void,
): Promise<(() => void) | null> {
  const listen = await getTauriListen();
  if (!listen) return null;

  try {
    return await listen('file-open-request', (event) => {
      const path = event.payload as string;
      if (path) {
        callback(path);
      }
    });
  } catch {
    return null;
  }
}

/**
 * Read a file by absolute path. Convenience alias for the read_text_file command.
 * Returns the file content or null.
 */
export async function readFileByPath(path: string): Promise<string | null> {
  const invoke = await getTauriInvoke();
  if (!invoke) return null;

  try {
    return (await invoke('read_text_file', { path })) as string;
  } catch {
    return null;
  }
}

// ── System Commands ──

/**
 * Get system information for capability detection.
 */
export async function getSystemInfo(): Promise<SystemInfoResponse | null> {
  const invoke = await getTauriInvoke();
  if (!invoke) return null;

  try {
    return (await invoke('get_system_info')) as SystemInfoResponse;
  } catch {
    return null;
  }
}
