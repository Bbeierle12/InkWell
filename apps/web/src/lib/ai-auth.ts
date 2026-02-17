/**
 * AI Auth utilities.
 *
 * Centralizes Claude auth method capabilities and API key resolution so
 * service bootstrapping does not duplicate auth-source logic.
 */

export type AIAuthMethod = 'api_key' | 'claude_subscription';

export interface ResolveClaudeApiKeyInput {
  settingsApiKey?: string | null;
  envApiKey?: string | null;
}

export interface ResolvedClaudeApiKey {
  method: 'api_key';
  source: 'settings' | 'environment';
  apiKey: string;
}

export interface ResolveClaudeAuthInput extends ResolveClaudeApiKeyInput {
  preferredMethod: AIAuthMethod;
  subscriptionSupported: boolean;
  subscriptionConnected: boolean;
}

export type ResolvedClaudeAuth =
  | { method: 'claude_subscription' }
  | ResolvedClaudeApiKey;

/**
 * Claude account/subscription sign-in toggle.
 * API-key auth is the active production path.
 */
export const CLAUDE_SUBSCRIPTION_SIGNIN_SUPPORTED = false;

export const CLAUDE_SUBSCRIPTION_SIGNIN_UNSUPPORTED_REASON =
  'This app is configured for Claude API key authentication.';

/**
 * Resolve a Claude API key, preferring user settings over environment.
 * Returns null when no usable key is available.
 */
export function resolveClaudeApiKey(
  input: ResolveClaudeApiKeyInput,
): ResolvedClaudeApiKey | null {
  const settingsCandidate = input.settingsApiKey?.trim();
  if (settingsCandidate) {
    return {
      method: 'api_key',
      source: 'settings',
      apiKey: settingsCandidate,
    };
  }

  const envCandidate = input.envApiKey?.trim();
  if (envCandidate) {
    return {
      method: 'api_key',
      source: 'environment',
      apiKey: envCandidate,
    };
  }

  return null;
}

/**
 * Resolve the active auth strategy for Claude operations.
 * Preference order:
 * 1) subscription when explicitly selected and connected
 * 2) API key from settings/environment
 */
export function resolveClaudeAuth(
  input: ResolveClaudeAuthInput,
): ResolvedClaudeAuth | null {
  if (
    input.preferredMethod === 'claude_subscription'
    && input.subscriptionSupported
    && input.subscriptionConnected
  ) {
    return { method: 'claude_subscription' };
  }

  return resolveClaudeApiKey(input);
}

export function sanitizeAuthErrorMessage(message: string): string {
  return message
    .replace(/sk-ant-[A-Za-z0-9\-_]+/g, 'sk-ant-[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, 'Bearer [REDACTED]');
}

export function getMissingClaudeApiKeyMessage(): string {
  return (
    'Claude API key is required but not configured. ' +
    'Set it in Settings > AI, or create a .env.local file in apps/web/ with:\n' +
    'NEXT_PUBLIC_CLAUDE_API_KEY=sk-ant-...'
  );
}
