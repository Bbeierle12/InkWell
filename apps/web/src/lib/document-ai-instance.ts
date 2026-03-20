/**
 * Singleton DocumentAI Service Instance
 *
 * Provides a single shared DocumentAI instance for the web application.
 * When running in a Tauri environment, injects a LocalInferenceProvider
 * that delegates to the Rust inference backends.
 */
import { DocumentAIServiceImpl, OllamaClient } from '@inkwell/document-ai';
import type { LocalInferenceProvider, CloudStreamRequest } from '@inkwell/document-ai';
import {
  isTauriEnvironment,
  invokeLocalInference,
  streamLocalInference,
} from './tauri-bridge';
import { useSettingsStore } from './settings-store';
import {
  getMissingClaudeApiKeyMessage,
  resolveClaudeAuth,
} from './ai-auth';
import { streamClaudeViaSubscription } from './claude-subscription-provider';

let instance: DocumentAIServiceImpl | null = null;

/**
 * Create a LocalInferenceProvider backed by Tauri bridge commands.
 *
 * Returns null when not running in a Tauri environment.
 */
function createTauriLocalProvider(): LocalInferenceProvider | undefined {
  if (!isTauriEnvironment()) return undefined;

  return {
    isAvailable() {
      return isTauriEnvironment();
    },

    async generate(prompt: string, maxTokens: number) {
      const result = await invokeLocalInference(prompt, maxTokens);
      return result ? { text: result.text } : null;
    },

    async generateStream(
      prompt: string,
      maxTokens: number,
      onToken: (token: string) => void,
    ) {
      const result = await streamLocalInference(prompt, maxTokens, onToken);
      return result ? { text: result.text } : null;
    },
  };
}

/**
 * Get the singleton DocumentAI service instance.
 *
 * Reads the API key from settings store first, then falls back to
 * the NEXT_PUBLIC_CLAUDE_API_KEY environment variable.
 * Throws a helpful error if neither is set.
 */
/**
 * Create an Ollama-backed cloudStreamProvider.
 *
 * Wraps OllamaClient.stream(), ignoring the model target string from
 * the router (the user's selected model is used instead).
 */
function createOllamaStreamProvider(
  baseUrl: string,
  model: string,
): (request: CloudStreamRequest) => AsyncGenerator<string, void, unknown> {
  const client = new OllamaClient({ baseUrl, model });
  return (request: CloudStreamRequest) =>
    client.stream(request.messages, {
      maxTokens: request.maxTokens,
      signal: request.signal,
      stopSequences: request.stopSequences,
      system: request.system,
    });
}

export function getDocumentAI(): DocumentAIServiceImpl {
  if (!instance) {
    const settings = useSettingsStore.getState();

    if (settings.aiProvider === 'ollama') {
      if (!settings.ollamaModel) {
        throw new Error(
          'Ollama is selected as the AI provider but no model is configured. ' +
          'Open Settings > AI and select a model.',
        );
      }
      instance = new DocumentAIServiceImpl({
        apiKey: '__ollama_no_key__',
        localProvider: createTauriLocalProvider(),
        cloudStreamProvider: createOllamaStreamProvider(
          settings.ollamaBaseUrl,
          settings.ollamaModel,
        ),
      });
    } else {
      const auth = resolveClaudeAuth({
        preferredMethod: settings.aiAuthMethod,
        subscriptionSupported: settings.claudeSubscriptionSupported,
        subscriptionConnected: settings.claudeSubscriptionConnected,
        settingsApiKey: settings.claudeApiKey,
        envApiKey: process.env.NEXT_PUBLIC_CLAUDE_API_KEY,
      });

      if (!auth) {
        throw new Error(getMissingClaudeApiKeyMessage());
      }

      instance = new DocumentAIServiceImpl({
        apiKey: auth.method === 'api_key' ? auth.apiKey : '__subscription_transport__',
        localProvider: createTauriLocalProvider(),
        cloudStreamProvider: auth.method === 'claude_subscription'
          ? streamClaudeViaSubscription
          : undefined,
      });
    }
  }
  return instance;
}

/**
 * Destroy the singleton instance and release resources.
 */
export function destroyDocumentAI(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
