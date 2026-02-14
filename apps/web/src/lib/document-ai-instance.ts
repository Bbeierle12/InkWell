/**
 * Singleton DocumentAI Service Instance
 *
 * Provides a single shared DocumentAI instance for the web application.
 */

let instance: unknown = null;

/**
 * Get the singleton DocumentAI service instance.
 */
export function getDocumentAI(): unknown {
  if (!instance) {
    // TODO: implement
    // - Create DocumentAI service with default configuration
    // - Configure model routing based on platform (Tauri vs web)
    throw new Error('not implemented');
  }
  return instance;
}
