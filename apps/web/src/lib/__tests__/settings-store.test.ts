import { describe, expect, it } from 'vitest';
import { sanitizePersistedSettings } from '../settings-store';

describe('sanitizePersistedSettings', () => {
  it('keeps valid persisted values', () => {
    const sanitized = sanitizePersistedSettings({
      theme: 'dark',
      editorFontFamily: 'serif',
      editorFontSize: 'large',
      editorWidth: 'wide',
      autoSaveEnabled: false,
      autoSaveIntervalMs: 120_000,
      spellCheck: false,
      showWordCount: false,
      showCharCount: true,

      ghostTextEnabled: true,
      ghostTextDebounceMs: 800,
    });

    expect(sanitized).toEqual({
      theme: 'dark',
      editorFontFamily: 'serif',
      editorFontSize: 'large',
      editorWidth: 'wide',
      autoSaveEnabled: false,
      autoSaveIntervalMs: 120_000,
      spellCheck: false,
      showWordCount: false,
      showCharCount: true,

      ghostTextEnabled: true,
      ghostTextDebounceMs: 800,
    });
  });

  it('drops invalid values instead of propagating them into store state', () => {
    const sanitized = sanitizePersistedSettings({
      theme: 'neon',
      editorFontFamily: 42,
      editorFontSize: null,
      editorWidth: 'full',
      autoSaveEnabled: 'yes',
      autoSaveIntervalMs: 9999,
      spellCheck: false,
      showWordCount: 'true',
      showCharCount: true,
      ghostTextEnabled: {},
      ghostTextDebounceMs: 500,
    });

    expect(sanitized).toEqual({
      editorWidth: 'full',
      spellCheck: false,
      showCharCount: true,
      ghostTextDebounceMs: 500,
    });
  });

  it('returns empty object for non-object payloads', () => {
    expect(sanitizePersistedSettings(null)).toEqual({});
    expect(sanitizePersistedSettings('oops')).toEqual({});
    expect(sanitizePersistedSettings(123)).toEqual({});
  });
});

describe('grammar settings persistence', () => {
  it('defaults both grammar categories to on', () => {
    const clean = sanitizePersistedSettings({});
    expect(clean.grammarSpelling).toBeUndefined(); // falls through to DEFAULTS
  });

  it('accepts valid grammar settings', () => {
    const clean = sanitizePersistedSettings({
      grammarSpelling: false,
      grammarGrammar: true,
      grammarDictionary: ['Bbeierle', 'InkWell'],
      grammarIgnoredLints: '[123,456]',
    });
    expect(clean.grammarSpelling).toBe(false);
    expect(clean.grammarGrammar).toBe(true);
    expect(clean.grammarDictionary).toEqual(['Bbeierle', 'InkWell']);
    expect(clean.grammarIgnoredLints).toBe('[123,456]');
  });

  it('rejects a corrupt dictionary rather than crashing the editor', () => {
    const clean = sanitizePersistedSettings({
      grammarDictionary: ['ok', 42, null, { nope: true }],
    });
    expect(clean.grammarDictionary).toEqual(['ok']);
  });

  it('rejects a non-array dictionary', () => {
    const clean = sanitizePersistedSettings({ grammarDictionary: 'not-an-array' });
    expect(clean.grammarDictionary).toBeUndefined();
  });
});
