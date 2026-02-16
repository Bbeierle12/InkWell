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
export type RoutingModeOption = 'auto' | 'local_only' | 'cloud_only';
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
  claudeApiKey: string;
  routingMode: RoutingModeOption;
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
  setClaudeApiKey: (key: string) => void;
  setRoutingMode: (mode: RoutingModeOption) => void;
  setGhostTextEnabled: (enabled: boolean) => void;
  setGhostTextDebounceMs: (delay: GhostTextDelay) => void;
  resetAll: () => void;
}

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
  claudeApiKey: '',
  routingMode: 'auto' as RoutingModeOption,
  ghostTextEnabled: true,
  ghostTextDebounceMs: 500 as GhostTextDelay,
};

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
      setClaudeApiKey: (claudeApiKey) => set({ claudeApiKey }),
      setRoutingMode: (routingMode) => set({ routingMode }),
      setGhostTextEnabled: (ghostTextEnabled) => set({ ghostTextEnabled }),
      setGhostTextDebounceMs: (ghostTextDebounceMs) => set({ ghostTextDebounceMs }),
      resetAll: () => set(DEFAULTS),
    }),
    {
      name: 'inkwell-settings',
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
        claudeApiKey: state.claudeApiKey,
        routingMode: state.routingMode,
        ghostTextEnabled: state.ghostTextEnabled,
        ghostTextDebounceMs: state.ghostTextDebounceMs,
      }),
    },
  ),
);
