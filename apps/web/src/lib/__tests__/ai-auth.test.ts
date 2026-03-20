import { describe, expect, it } from 'vitest';
import {
  getMissingClaudeApiKeyMessage,
  resolveClaudeApiKey,
  sanitizeAuthErrorMessage,
} from '../ai-auth';

describe('ai-auth', () => {
  it('prefers settings API key over environment key', () => {
    const resolved = resolveClaudeApiKey({
      settingsApiKey: ' sk-ant-settings ',
      envApiKey: 'sk-ant-env',
    });

    expect(resolved).toEqual({
      method: 'api_key',
      source: 'settings',
      apiKey: 'sk-ant-settings',
    });
  });

  it('falls back to environment key when settings key is absent', () => {
    const resolved = resolveClaudeApiKey({
      settingsApiKey: '',
      envApiKey: ' sk-ant-env ',
    });

    expect(resolved).toEqual({
      method: 'api_key',
      source: 'environment',
      apiKey: 'sk-ant-env',
    });
  });

  it('returns null when no key is configured', () => {
    const resolved = resolveClaudeApiKey({
      settingsApiKey: '   ',
      envApiKey: undefined,
    });

    expect(resolved).toBeNull();
  });

  it('returns a helpful missing-key message', () => {
    expect(getMissingClaudeApiKeyMessage()).toContain('NEXT_PUBLIC_CLAUDE_API_KEY');
  });

  it('redacts token-like values from auth error messages', () => {
    const safe = sanitizeAuthErrorMessage('Bearer abc123 sk-ant-XYZ');
    expect(safe).toBe('Bearer [REDACTED] sk-ant-[REDACTED]');
  });
});
