import {
  clearSecureClaudeApiKey,
  getSecureClaudeApiKey,
  isTauriEnvironment,
  setSecureClaudeApiKey,
} from './tauri-bridge';

const SETTINGS_STORAGE_KEY = 'inkwell-settings';

interface PersistedSettingsEnvelope {
  state?: Record<string, unknown>;
  version?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Load Claude API key from secure desktop storage.
 */
export async function loadClaudeApiKeyFromSecureStorage(): Promise<string | null> {
  if (!isTauriEnvironment()) return null;
  return getSecureClaudeApiKey();
}

/**
 * Persist Claude API key in secure desktop storage.
 * Empty values clear the stored key.
 */
export async function saveClaudeApiKeyToSecureStorage(apiKey: string): Promise<boolean> {
  if (!isTauriEnvironment()) return false;
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return clearSecureClaudeApiKey();
  }
  return setSecureClaudeApiKey(trimmed);
}

/**
 * One-time migration: move legacy Claude API key from localStorage-backed
 * settings payload to secure desktop storage and scrub the plaintext field.
 */
export async function migrateLegacyClaudeApiKeyFromLocalStorage(): Promise<void> {
  if (typeof window === 'undefined' || !isTauriEnvironment()) return;

  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return;

  let parsed: PersistedSettingsEnvelope;
  try {
    parsed = JSON.parse(raw) as PersistedSettingsEnvelope;
  } catch {
    return;
  }

  if (!isRecord(parsed) || !isRecord(parsed.state)) return;

  const state = parsed.state;
  const hasLegacyField = Object.prototype.hasOwnProperty.call(state, 'claudeApiKey');
  if (!hasLegacyField) return;

  const legacyKey = typeof state.claudeApiKey === 'string' ? state.claudeApiKey.trim() : '';

  // Keep the legacy key in place if secure write fails to avoid data loss.
  if (legacyKey) {
    const saved = await setSecureClaudeApiKey(legacyKey);
    if (!saved) return;
  }

  delete state.claudeApiKey;
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
}
