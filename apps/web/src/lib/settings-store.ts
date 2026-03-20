/**
 * Settings Store — Zustand store with localStorage persistence.
 *
 * Centralizes all user-configurable settings: appearance, editor behavior,
 * AI configuration, and more. Persisted via zustand/middleware `persist`.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Types ──

export type ThemeMode = 'light' | 'dark' | 'system';
export type EditorFontFamily = 'system' | 'serif' | 'sans-serif' | 'mono';
export type EditorFontSize = 'small' | 'default' | 'large' | 'xl';
export type EditorWidth = 'narrow' | 'default' | 'wide' | 'full';
export type AIProvider = 'claude' | 'ollama';
export type GhostTextDelay = 300 | 500 | 800;
export type AutoSaveInterval = 10_000 | 30_000 | 60_000 | 120_000 | 300_000;

interface SettingsState {
  // Appearance
  theme: ThemeMode;
  editorFontFamily: EditorFontFamily;
  editorFontSize: EditorFontSize;
  editorWidth: EditorWidth;

  // Editor
  autoSaveEnabled: boolean;
  autoSaveIntervalMs: AutoSaveInterval;
  spellCheck: boolean;
  showWordCount: boolean;
  showCharCount: boolean;

  // AI
  aiProvider: AIProvider;
  claudeApiKey: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ghostTextEnabled: boolean;
  ghostTextDebounceMs: GhostTextDelay;

  // Actions
  setTheme: (theme: ThemeMode) => void;
  setEditorFontFamily: (family: EditorFontFamily) => void;
  setEditorFontSize: (size: EditorFontSize) => void;
  setEditorWidth: (width: EditorWidth) => void;
  setAutoSaveEnabled: (enabled: boolean) => void;
  setAutoSaveIntervalMs: (interval: AutoSaveInterval) => void;
  setSpellCheck: (enabled: boolean) => void;
  setShowWordCount: (show: boolean) => void;
  setShowCharCount: (show: boolean) => void;
  setAiProvider: (provider: AIProvider) => void;
  setClaudeApiKey: (key: string) => void;
  setOllamaBaseUrl: (url: string) => void;
  setOllamaModel: (model: string) => void;
  setGhostTextEnabled: (enabled: boolean) => void;
  setGhostTextDebounceMs: (delay: GhostTextDelay) => void;
  resetAll: () => void;
}

type PersistedSettingsShape = Pick<
  SettingsState,
  | 'theme'
  | 'editorFontFamily'
  | 'editorFontSize'
  | 'editorWidth'
  | 'autoSaveEnabled'
  | 'autoSaveIntervalMs'
  | 'spellCheck'
  | 'showWordCount'
  | 'showCharCount'
  | 'aiProvider'
  | 'ollamaBaseUrl'
  | 'ollamaModel'
  | 'ghostTextEnabled'
  | 'ghostTextDebounceMs'
>;

// ── Defaults ──

const DEFAULTS = {
  theme: 'system' as ThemeMode,
  editorFontFamily: 'system' as EditorFontFamily,
  editorFontSize: 'default' as EditorFontSize,
  editorWidth: 'default' as EditorWidth,
  autoSaveEnabled: true,
  autoSaveIntervalMs: 30_000 as AutoSaveInterval,
  spellCheck: true,
  showWordCount: true,
  showCharCount: true,
  aiProvider: 'claude' as AIProvider,
  claudeApiKey: '',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: '',
  ghostTextEnabled: true,
  ghostTextDebounceMs: 500 as GhostTextDelay,
};

const THEME_VALUES: ThemeMode[] = ['light', 'dark', 'system'];
const FONT_FAMILY_VALUES: EditorFontFamily[] = ['system', 'serif', 'sans-serif', 'mono'];
const FONT_SIZE_VALUES: EditorFontSize[] = ['small', 'default', 'large', 'xl'];
const EDITOR_WIDTH_VALUES: EditorWidth[] = ['narrow', 'default', 'wide', 'full'];
const AUTO_SAVE_INTERVAL_VALUES: AutoSaveInterval[] = [10_000, 30_000, 60_000, 120_000, 300_000];
const AI_PROVIDER_VALUES: AIProvider[] = ['claude', 'ollama'];
const GHOST_TEXT_DELAY_VALUES: GhostTextDelay[] = [300, 500, 800];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pickStringEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : undefined;
}

function pickNumberEnum<T extends number>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === 'number' && allowed.includes(value as T) ? (value as T) : undefined;
}

/**
 * Sanitize persisted settings from localStorage so invalid/corrupt values
 * cannot destabilize UI rendering.
 */
export function sanitizePersistedSettings(value: unknown): Partial<PersistedSettingsShape> {
  if (!isRecord(value)) return {};

  const next: Partial<PersistedSettingsShape> = {};

  const theme = pickStringEnum(value.theme, THEME_VALUES);
  if (theme) next.theme = theme;

  const editorFontFamily = pickStringEnum(value.editorFontFamily, FONT_FAMILY_VALUES);
  if (editorFontFamily) next.editorFontFamily = editorFontFamily;

  const editorFontSize = pickStringEnum(value.editorFontSize, FONT_SIZE_VALUES);
  if (editorFontSize) next.editorFontSize = editorFontSize;

  const editorWidth = pickStringEnum(value.editorWidth, EDITOR_WIDTH_VALUES);
  if (editorWidth) next.editorWidth = editorWidth;

  if (typeof value.autoSaveEnabled === 'boolean') next.autoSaveEnabled = value.autoSaveEnabled;

  const autoSaveIntervalMs = pickNumberEnum(value.autoSaveIntervalMs, AUTO_SAVE_INTERVAL_VALUES);
  if (autoSaveIntervalMs) next.autoSaveIntervalMs = autoSaveIntervalMs;

  if (typeof value.spellCheck === 'boolean') next.spellCheck = value.spellCheck;
  if (typeof value.showWordCount === 'boolean') next.showWordCount = value.showWordCount;
  if (typeof value.showCharCount === 'boolean') next.showCharCount = value.showCharCount;

  const aiProvider = pickStringEnum(value.aiProvider, AI_PROVIDER_VALUES);
  if (aiProvider) next.aiProvider = aiProvider;

  if (typeof value.ollamaBaseUrl === 'string') next.ollamaBaseUrl = value.ollamaBaseUrl;
  if (typeof value.ollamaModel === 'string') next.ollamaModel = value.ollamaModel;

  if (typeof value.ghostTextEnabled === 'boolean') next.ghostTextEnabled = value.ghostTextEnabled;

  const ghostTextDebounceMs = pickNumberEnum(value.ghostTextDebounceMs, GHOST_TEXT_DELAY_VALUES);
  if (ghostTextDebounceMs) next.ghostTextDebounceMs = ghostTextDebounceMs;

  return next;
}

// ── Font Family CSS Values ──

export const FONT_FAMILY_MAP: Record<EditorFontFamily, string> = {
  system: 'system-ui, -apple-system, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  'sans-serif': '"Helvetica Neue", Helvetica, Arial, sans-serif',
  mono: '"SF Mono", "Fira Code", "Cascadia Code", monospace',
};

// ── Font Size CSS Values ──

export const FONT_SIZE_MAP: Record<EditorFontSize, string> = {
  small: '14px',
  default: '18px',
  large: '20px',
  xl: '24px',
};

// ── Editor Width CSS Values ──

export const EDITOR_WIDTH_MAP: Record<EditorWidth, string> = {
  narrow: '640px',
  default: '896px',
  wide: '1152px',
  full: '100%',
};

// ── Store ──

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setTheme: (theme) => set({ theme }),
      setEditorFontFamily: (editorFontFamily) => set({ editorFontFamily }),
      setEditorFontSize: (editorFontSize) => set({ editorFontSize }),
      setEditorWidth: (editorWidth) => set({ editorWidth }),
      setAutoSaveEnabled: (autoSaveEnabled) => set({ autoSaveEnabled }),
      setAutoSaveIntervalMs: (autoSaveIntervalMs) => set({ autoSaveIntervalMs }),
      setSpellCheck: (spellCheck) => set({ spellCheck }),
      setShowWordCount: (showWordCount) => set({ showWordCount }),
      setShowCharCount: (showCharCount) => set({ showCharCount }),
      setAiProvider: (aiProvider) => set({
        aiProvider: AI_PROVIDER_VALUES.includes(aiProvider) ? aiProvider : DEFAULTS.aiProvider,
      }),
      setClaudeApiKey: (claudeApiKey) => set({ claudeApiKey }),
      setOllamaBaseUrl: (ollamaBaseUrl) => set({ ollamaBaseUrl }),
      setOllamaModel: (ollamaModel) => set({ ollamaModel }),
      setGhostTextEnabled: (ghostTextEnabled) => set({ ghostTextEnabled }),
      setGhostTextDebounceMs: (ghostTextDebounceMs) => set({ ghostTextDebounceMs }),
      resetAll: () => set(DEFAULTS),
    }),
    {
      name: 'inkwell-settings',
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedSettings(persistedState),
      }),
      partialize: (state) => ({
        theme: state.theme,
        editorFontFamily: state.editorFontFamily,
        editorFontSize: state.editorFontSize,
        editorWidth: state.editorWidth,
        autoSaveEnabled: state.autoSaveEnabled,
        autoSaveIntervalMs: state.autoSaveIntervalMs,
        spellCheck: state.spellCheck,
        showWordCount: state.showWordCount,
        showCharCount: state.showCharCount,
        aiProvider: state.aiProvider,
        ollamaBaseUrl: state.ollamaBaseUrl,
        ollamaModel: state.ollamaModel,
        ghostTextEnabled: state.ghostTextEnabled,
        ghostTextDebounceMs: state.ghostTextDebounceMs,
      }),
    },
  ),
);
