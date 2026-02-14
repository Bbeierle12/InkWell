/**
 * Singleton DocumentAI Service Instance
 *
 * Provides a single shared DocumentAI instance for the web application.
 */
import { DocumentAIServiceImpl } from '@inkwell/document-ai';

let instance: DocumentAIServiceImpl | null = null;

/**
 * Get the singleton DocumentAI service instance.
 *
 * Reads the API key from NEXT_PUBLIC_CLAUDE_API_KEY environment variable.
 * Throws a helpful error if the key is not set.
 */
export function getDocumentAI(): DocumentAIServiceImpl {
  if (!instance) {
    const apiKey = process.env.NEXT_PUBLIC_CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error(
        'NEXT_PUBLIC_CLAUDE_API_KEY is not set. ' +
        'Create a .env.local file in apps/web/ with:\n' +
        'NEXT_PUBLIC_CLAUDE_API_KEY=sk-ant-...',
      );
    }

    instance = new DocumentAIServiceImpl({ apiKey });
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
