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
