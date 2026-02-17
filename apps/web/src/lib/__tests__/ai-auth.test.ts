import { describe, expect, it } from 'vitest';
import {
  CLAUDE_SUBSCRIPTION_SIGNIN_SUPPORTED,
  getMissingClaudeApiKeyMessage,
  resolveClaudeAuth,
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

  it('exposes unsupported subscription sign-in capability flag', () => {
    expect(CLAUDE_SUBSCRIPTION_SIGNIN_SUPPORTED).toBe(true);
  });

  it('returns a helpful missing-key message', () => {
    expect(getMissingClaudeApiKeyMessage()).toContain('NEXT_PUBLIC_CLAUDE_API_KEY');
  });

  it('selects subscription auth when preferred and connected', () => {
    const resolved = resolveClaudeAuth({
      preferredMethod: 'claude_subscription',
      subscriptionSupported: true,
      subscriptionConnected: true,
      settingsApiKey: '',
      envApiKey: '',
    });

    expect(resolved).toEqual({ method: 'claude_subscription' });
  });

  it('falls back to api key when subscription is unavailable', () => {
    const resolved = resolveClaudeAuth({
      preferredMethod: 'claude_subscription',
      subscriptionSupported: false,
      subscriptionConnected: false,
      settingsApiKey: 'sk-ant-settings',
      envApiKey: '',
    });

    expect(resolved).toEqual({
      method: 'api_key',
      source: 'settings',
      apiKey: 'sk-ant-settings',
    });
  });

  it('redacts token-like values from auth error messages', () => {
    const safe = sanitizeAuthErrorMessage('Bearer abc123 sk-ant-XYZ');
    expect(safe).toBe('Bearer [REDACTED] sk-ant-[REDACTED]');
  });
});
