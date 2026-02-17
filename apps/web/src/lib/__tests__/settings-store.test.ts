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
      aiAuthMethod: 'claude_subscription',
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
      aiAuthMethod: 'claude_subscription',
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
      aiAuthMethod: 'oauth',
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
