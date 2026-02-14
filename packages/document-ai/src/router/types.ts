/**
 * Router type definitions.
 */
import { ModelTarget, OperationType } from '@inkwell/shared';

/** Result of a routing decision. */
export interface RoutingResult {
  target: ModelTarget;
  operation: OperationType;
  reason: string;
}

/** Error thrown in CloudOnly mode when the network is unavailable. */
export class CloudUnavailableError extends Error {
  constructor(operation: OperationType) {
    super(
      `CloudOnly mode: cannot route ${operation} — network is unavailable. ` +
      `Switch to Auto or LocalOnly mode for offline operation.`,
    );
    this.name = 'CloudUnavailableError';
  }
}
