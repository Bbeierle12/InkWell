/**
 * Internal types for the DocumentAI runtime.
 */
import type { OperationType, ModelTarget, DocumentContext, QueuedRequest } from '@inkwell/shared';

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
