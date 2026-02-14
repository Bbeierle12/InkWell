/**
 * @inkwell/document-ai — The AI brain of Inkwell.
 *
 * Provides model routing, request queuing, context assembly,
 * and output reconciliation for all AI-powered editing operations.
 */

export { ModelRouter, CloudUnavailableError } from './router';
export { QueueManager } from './queue';
export { TokenBudgetTracker } from './queue/token-budget';
export { BackpressureManager } from './queue/backpressure';
export { Debouncer } from './queue/debouncer';
export { DocumentAIQueue } from './queue/document-ai-queue';
export { ContextManager } from './context';
export { Reconciler } from './reconciler';
export { ClaudeClient } from './claude/client';
export type { DocumentAIService } from './types';
