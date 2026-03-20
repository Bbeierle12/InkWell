/**
 * AI Auth utilities.
 *
 * Centralizes Claude API key resolution so service bootstrapping
 * does not duplicate auth-source logic.
 */

export interface ResolveClaudeApiKeyInput {
  settingsApiKey?: string | null;
  envApiKey?: string | null;
}

export interface ResolvedClaudeApiKey {
  method: 'api_key';
  source: 'settings' | 'environment';
  apiKey: string;
}

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
