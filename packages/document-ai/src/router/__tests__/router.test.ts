import { OperationType, ModelTarget, RoutingMode } from '@inkwell/shared';
import { ModelRouter } from '../index';

/**
 * 2.1 Model Routing Tests
 *
 * Invariant: private-docs-never-reach-cloud
 */

describe('2.1 Model Routing', () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = new ModelRouter();
  });

  // ── Auto Mode: Operation type routing ─────────────────────────────

  describe('Auto mode — operation type routing', () => {
    it('should route InlineSuggest to Local', () => {
      const result = router.route(OperationType.InlineSuggest, false);
      expect(result.target).toBe(ModelTarget.Local);
      expect(result.operation).toBe(OperationType.InlineSuggest);
    });

    it('should route Rewrite to Sonnet', () => {
      const result = router.route(OperationType.Rewrite, false);
      expect(result.target).toBe(ModelTarget.Sonnet);
      expect(result.operation).toBe(OperationType.Rewrite);
    });

    it('should route Summarize to Sonnet', () => {
      const result = router.route(OperationType.Summarize, false);
      expect(result.target).toBe(ModelTarget.Sonnet);
      expect(result.operation).toBe(OperationType.Summarize);
    });

    it('should route Expand to Sonnet', () => {
      const result = router.route(OperationType.Expand, false);
      expect(result.target).toBe(ModelTarget.Sonnet);
      expect(result.operation).toBe(OperationType.Expand);
    });

    it('should route VoiceRefine to Sonnet', () => {
      const result = router.route(OperationType.VoiceRefine, false);
      expect(result.target).toBe(ModelTarget.Sonnet);
      expect(result.operation).toBe(OperationType.VoiceRefine);
    });

    it('should route Critique to Opus', () => {
      const result = router.route(OperationType.Critique, false);
      expect(result.target).toBe(ModelTarget.Opus);
      expect(result.operation).toBe(OperationType.Critique);
    });
  });

  // ── LocalOnly Mode ────────────────────────────────────────────────

  describe('LocalOnly mode', () => {
    beforeEach(() => {
      router.setMode(RoutingMode.LocalOnly);
    });

    it('should route ALL operation types to Local', () => {
      const operations = Object.values(OperationType);
      for (const op of operations) {
        const result = router.route(op, false);
        expect(result.target).toBe(ModelTarget.Local);
        expect(result.operation).toBe(op);
      }
    });

    it('should route private documents to Local', () => {
      const operations = Object.values(OperationType);
      for (const op of operations) {
        const result = router.route(op, true);
        expect(result.target).toBe(ModelTarget.Local);
      }
    });
  });

  // ── CloudOnly Mode ────────────────────────────────────────────────

  describe('CloudOnly mode', () => {
    beforeEach(() => {
      router.setMode(RoutingMode.CloudOnly);
    });

    it('should route InlineSuggest to Sonnet', () => {
      const result = router.route(OperationType.InlineSuggest, false);
      expect(result.target).toBe(ModelTarget.Sonnet);
    });

    it('should route Rewrite to Sonnet', () => {
      const result = router.route(OperationType.Rewrite, false);
      expect(result.target).toBe(ModelTarget.Sonnet);
    });

    it('should route Summarize to Sonnet', () => {
      const result = router.route(OperationType.Summarize, false);
      expect(result.target).toBe(ModelTarget.Sonnet);
    });

    it('should route Expand to Sonnet', () => {
      const result = router.route(OperationType.Expand, false);
      expect(result.target).toBe(ModelTarget.Sonnet);
    });

    it('should route VoiceRefine to Sonnet', () => {
      const result = router.route(OperationType.VoiceRefine, false);
      expect(result.target).toBe(ModelTarget.Sonnet);
    });

    it('should route Critique to Opus', () => {
      const result = router.route(OperationType.Critique, false);
      expect(result.target).toBe(ModelTarget.Opus);
    });
  });

  // ── Private Document Protection ───────────────────────────────────
  // Invariant: private-docs-never-reach-cloud

  describe('Private document protection (invariant: private-docs-never-reach-cloud)', () => {
    it('should ALWAYS route private documents to Local in Auto mode', () => {
      router.setMode(RoutingMode.Auto);
      const operations = Object.values(OperationType);
      for (const op of operations) {
        const result = router.route(op, true);
        expect(result.target).toBe(ModelTarget.Local);
        expect(result.reason).toContain('private');
      }
    });

    it('should ALWAYS route private documents to Local in CloudOnly mode', () => {
      router.setMode(RoutingMode.CloudOnly);
      const operations = Object.values(OperationType);
      for (const op of operations) {
        const result = router.route(op, true);
        expect(result.target).toBe(ModelTarget.Local);
        expect(result.reason).toContain('private');
      }
    });

    it('should ALWAYS route private documents to Local in LocalOnly mode', () => {
      router.setMode(RoutingMode.LocalOnly);
      const operations = Object.values(OperationType);
      for (const op of operations) {
        const result = router.route(op, true);
        expect(result.target).toBe(ModelTarget.Local);
      }
    });

    it('should never return Sonnet or Opus for private documents in any mode', () => {
      const modes = Object.values(RoutingMode);
      const operations = Object.values(OperationType);
      for (const mode of modes) {
        router.setMode(mode);
        for (const op of operations) {
          const result = router.route(op, true);
          expect(result.target).not.toBe(ModelTarget.Sonnet);
          expect(result.target).not.toBe(ModelTarget.Opus);
        }
      }
    });
  });

  // ── CloudOnly + Private Override ──────────────────────────────────

  describe('CloudOnly + private override', () => {
    it('should override to Local with descriptive reason', () => {
      router.setMode(RoutingMode.CloudOnly);
      const result = router.route(OperationType.Critique, true);
      expect(result.target).toBe(ModelTarget.Local);
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.reason.toLowerCase()).toContain('private');
    });
  });

  // ── Mode Switching ────────────────────────────────────────────────

  describe('Mode switching', () => {
    it('should change routing behavior when mode changes', () => {
      // Auto mode: Rewrite -> Sonnet
      router.setMode(RoutingMode.Auto);
      const autoResult = router.route(OperationType.Rewrite, false);
      expect(autoResult.target).toBe(ModelTarget.Sonnet);

      // Switch to LocalOnly: Rewrite -> Local
      router.setMode(RoutingMode.LocalOnly);
      const localResult = router.route(OperationType.Rewrite, false);
      expect(localResult.target).toBe(ModelTarget.Local);

      // Switch to CloudOnly: Rewrite -> Sonnet
      router.setMode(RoutingMode.CloudOnly);
      const cloudResult = router.route(OperationType.Rewrite, false);
      expect(cloudResult.target).toBe(ModelTarget.Sonnet);
    });

    it('should maintain privacy override across mode switches', () => {
      router.setMode(RoutingMode.CloudOnly);
      expect(router.route(OperationType.Critique, true).target).toBe(ModelTarget.Local);

      router.setMode(RoutingMode.Auto);
      expect(router.route(OperationType.Critique, true).target).toBe(ModelTarget.Local);

      router.setMode(RoutingMode.LocalOnly);
      expect(router.route(OperationType.Critique, true).target).toBe(ModelTarget.Local);
    });
  });

  // ── Concurrent Routing ────────────────────────────────────────────

  describe('Concurrent routing', () => {
    it('should return correct results for multiple simultaneous route() calls', () => {
      router.setMode(RoutingMode.Auto);

      const results = [
        router.route(OperationType.InlineSuggest, false),
        router.route(OperationType.Rewrite, false),
        router.route(OperationType.Critique, false),
        router.route(OperationType.Summarize, true),
        router.route(OperationType.Expand, false),
        router.route(OperationType.VoiceRefine, false),
      ];

      expect(results[0].target).toBe(ModelTarget.Local);       // InlineSuggest
      expect(results[1].target).toBe(ModelTarget.Sonnet);       // Rewrite
      expect(results[2].target).toBe(ModelTarget.Opus);         // Critique
      expect(results[3].target).toBe(ModelTarget.Local);        // Summarize (private)
      expect(results[4].target).toBe(ModelTarget.Sonnet);       // Expand
      expect(results[5].target).toBe(ModelTarget.Sonnet);       // VoiceRefine

      // Each result preserves the correct operation
      expect(results[0].operation).toBe(OperationType.InlineSuggest);
      expect(results[1].operation).toBe(OperationType.Rewrite);
      expect(results[2].operation).toBe(OperationType.Critique);
      expect(results[3].operation).toBe(OperationType.Summarize);
      expect(results[4].operation).toBe(OperationType.Expand);
      expect(results[5].operation).toBe(OperationType.VoiceRefine);
    });
  });

  // ── Reason Field ──────────────────────────────────────────────────

  describe('All results include reason', () => {
    it('should include a non-empty reason in every RoutingResult', () => {
      const modes = Object.values(RoutingMode);
      const operations = Object.values(OperationType);
      const privacyFlags = [true, false];

      for (const mode of modes) {
        router.setMode(mode);
        for (const op of operations) {
          for (const isPrivate of privacyFlags) {
            const result = router.route(op, isPrivate);
            expect(result.reason).toBeDefined();
            expect(typeof result.reason).toBe('string');
            expect(result.reason.length).toBeGreaterThan(0);
          }
        }
      }
    });
  });
});
