/**
 * Internal types for the DocumentAI runtime.
 */
import type { OperationType, ModelTarget, DocumentContext, QueuedRequest } from '@inkwell/shared';

/**
 * Provider interface for local inference backends (e.g., Tauri/llama.cpp).
 *
 * When available, the DocumentAI service delegates Local-target operations
 * to this provider instead of returning empty results.
 */
export interface LocalInferenceProvider {
  /** Check if the local inference backend is available and a model is loaded. */
  isAvailable(): boolean;

  /** Generate text from a prompt using the local model. */
  generate(prompt: string, maxTokens: number): Promise<{ text: string } | null>;

  /** Generate text with streaming token callbacks. */
  generateStream(
    prompt: string,
    maxTokens: number,
    onToken: (token: string) => void,
  ): Promise<{ text: string } | null>;
}

/** The main DocumentAI service interface. */
export interface DocumentAIService {
  /** Route an operation to the appropriate model. */
  route(operation: OperationType): ModelTarget;

  /** Enqueue an AI request with priority and cancellation. */
  enqueue(request: QueuedRequest): Promise<void>;

  /** Build the context window for a given cursor position. */
  buildContext(docContent: string, cursorPos: number): DocumentContext;

  /** Reconcile AI output into editor transactions. */
  reconcile(aiOutput: string, currentDoc: unknown): unknown;

  /** Tear down all active streams and pending requests. */
  destroy(): void;
}
