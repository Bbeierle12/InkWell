/**
 * Model Router
 *
 * Routes AI operations to the appropriate model (local vs. cloud)
 * based on operation type, document sensitivity, and user preferences.
 */
import { OperationType, ModelTarget, RoutingMode } from '@inkwell/shared';
import type { RoutingResult } from './types';

export class ModelRouter {
  private mode: RoutingMode = RoutingMode.Auto;

  /**
   * Set the routing mode (auto, local-only, cloud-only).
   */
  setMode(mode: RoutingMode): void {
    this.mode = mode;
  }

  /**
   * Route an operation to the appropriate model target.
   *
   * Invariant: private-docs-never-reach-cloud
   * Private documents MUST always route to Local, regardless of mode or operation.
   */
  route(operation: OperationType, isPrivate: boolean): RoutingResult {
    // Invariant: private-docs-never-reach-cloud
    // Private documents MUST never route to cloud, regardless of mode.
    if (isPrivate) {
      return {
        target: ModelTarget.Local,
        operation,
        reason: 'Document is private — routing to local model to protect sensitive content',
      };
    }

    switch (this.mode) {
      case RoutingMode.LocalOnly:
        return {
          target: ModelTarget.Local,
          operation,
          reason: 'Local-only mode — all operations routed to local model',
        };

      case RoutingMode.CloudOnly:
        return {
          target: this.cloudTargetForOperation(operation),
          operation,
          reason: `Cloud-only mode — routing ${operation} to cloud model`,
        };

      case RoutingMode.Auto:
        return this.routeAuto(operation);

      default: {
        // Exhaustiveness check
        const _exhaustive: never = this.mode;
        throw new Error(`Unknown routing mode: ${_exhaustive}`);
      }
    }
  }

  /**
   * Determine the cloud model target based on operation type.
   */
  private cloudTargetForOperation(operation: OperationType): ModelTarget {
    switch (operation) {
      case OperationType.Critique:
        return ModelTarget.Opus;
      case OperationType.InlineSuggest:
      case OperationType.Rewrite:
      case OperationType.Summarize:
      case OperationType.Expand:
      case OperationType.VoiceRefine:
        return ModelTarget.Sonnet;
      default: {
        const _exhaustive: never = operation;
        throw new Error(`Unknown operation type: ${_exhaustive}`);
      }
    }
  }

  /**
   * Route in Auto mode based on operation characteristics.
   */
  private routeAuto(operation: OperationType): RoutingResult {
    switch (operation) {
      case OperationType.InlineSuggest:
        return {
          target: ModelTarget.Local,
          operation,
          reason: 'Auto mode — inline suggestions use local model for low latency',
        };

      case OperationType.Rewrite:
      case OperationType.Summarize:
      case OperationType.Expand:
      case OperationType.VoiceRefine:
        return {
          target: ModelTarget.Sonnet,
          operation,
          reason: `Auto mode — ${operation} routed to Sonnet for balanced quality and speed`,
        };

      case OperationType.Critique:
        return {
          target: ModelTarget.Opus,
          operation,
          reason: 'Auto mode — deep critique routed to Opus for maximum quality',
        };

      default: {
        const _exhaustive: never = operation;
        throw new Error(`Unknown operation type: ${_exhaustive}`);
      }
    }
  }
}
