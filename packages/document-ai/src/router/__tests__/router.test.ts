import { OperationType, ModelTarget, RoutingMode } from '@inkwell/shared';
import { ModelRouter, CloudUnavailableError } from '../index';

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

    it('should route private documents to Local even when offline', () => {
      router.setOnline(false);
      const modes = Object.values(RoutingMode);
      const operations = Object.values(OperationType);
      for (const mode of modes) {
        router.setMode(mode);
        for (const op of operations) {
          // Private override takes priority — never throws, even in CloudOnly+offline
          const result = router.route(op, true);
          expect(result.target).toBe(ModelTarget.Local);
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

  // ── Offline Fallback ──────────────────────────────────────────────

  describe('Offline fallback (Auto mode)', () => {
    it('should route ALL operations to Local when offline in Auto mode', () => {
      router.setMode(RoutingMode.Auto);
      router.setOnline(false);

      const operations = Object.values(OperationType);
      for (const op of operations) {
        const result = router.route(op, false);
        expect(result.target).toBe(ModelTarget.Local);
        expect(result.reason).toContain('offline');
      }
    });

    it('should route Rewrite to Local when offline (normally Sonnet)', () => {
      router.setMode(RoutingMode.Auto);
      router.setOnline(false);

      const result = router.route(OperationType.Rewrite, false);
      expect(result.target).toBe(ModelTarget.Local);
    });

    it('should route Critique to Local when offline (normally Opus)', () => {
      router.setMode(RoutingMode.Auto);
      router.setOnline(false);

      const result = router.route(OperationType.Critique, false);
      expect(result.target).toBe(ModelTarget.Local);
    });

    it('should keep InlineSuggest on Local when offline (already local)', () => {
      router.setMode(RoutingMode.Auto);
      router.setOnline(false);

      const result = router.route(OperationType.InlineSuggest, false);
      expect(result.target).toBe(ModelTarget.Local);
    });

    it('should include "offline fallback" in reason string', () => {
      router.setMode(RoutingMode.Auto);
      router.setOnline(false);

      const result = router.route(OperationType.Summarize, false);
      expect(result.reason.toLowerCase()).toContain('offline');
      expect(result.reason.toLowerCase()).toContain('fallback');
    });
  });

  // ── Online Restoration ────────────────────────────────────────────

  describe('Online restoration', () => {
    it('should resume cloud routing when network returns in Auto mode', () => {
      router.setMode(RoutingMode.Auto);

      // Initially online — Rewrite → Sonnet
      expect(router.route(OperationType.Rewrite, false).target).toBe(ModelTarget.Sonnet);

      // Go offline — Rewrite → Local
      router.setOnline(false);
      expect(router.route(OperationType.Rewrite, false).target).toBe(ModelTarget.Local);

      // Come back online — Rewrite → Sonnet again
      router.setOnline(true);
      expect(router.route(OperationType.Rewrite, false).target).toBe(ModelTarget.Sonnet);
    });

    it('should restore Critique → Opus after offline period', () => {
      router.setMode(RoutingMode.Auto);

      router.setOnline(false);
      expect(router.route(OperationType.Critique, false).target).toBe(ModelTarget.Local);

      router.setOnline(true);
      expect(router.route(OperationType.Critique, false).target).toBe(ModelTarget.Opus);
    });

    it('should restore all operation routes after offline → online cycle', () => {
      router.setMode(RoutingMode.Auto);

      // Capture online routing
      const onlineTargets = Object.values(OperationType).map((op) => ({
        op,
        target: router.route(op, false).target,
      }));

      // Go offline and back
      router.setOnline(false);
      router.setOnline(true);

      // Verify all routes match original
      for (const { op, target } of onlineTargets) {
        expect(router.route(op, false).target).toBe(target);
      }
    });
  });

  // ── CloudOnly + Offline ───────────────────────────────────────────

  describe('CloudOnly mode — offline behavior', () => {
    it('should throw CloudUnavailableError when offline in CloudOnly mode', () => {
      router.setMode(RoutingMode.CloudOnly);
      router.setOnline(false);

      expect(() => router.route(OperationType.Rewrite, false))
        .toThrow(CloudUnavailableError);
    });

    it('should throw for all operation types when offline in CloudOnly mode', () => {
      router.setMode(RoutingMode.CloudOnly);
      router.setOnline(false);

      const operations = Object.values(OperationType);
      for (const op of operations) {
        expect(() => router.route(op, false)).toThrow(CloudUnavailableError);
      }
    });

    it('should include operation name in CloudUnavailableError message', () => {
      router.setMode(RoutingMode.CloudOnly);
      router.setOnline(false);

      try {
        router.route(OperationType.Critique, false);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CloudUnavailableError);
        expect((err as Error).message).toContain(OperationType.Critique);
      }
    });

    it('should resume after coming back online in CloudOnly mode', () => {
      router.setMode(RoutingMode.CloudOnly);

      router.setOnline(false);
      expect(() => router.route(OperationType.Rewrite, false)).toThrow(CloudUnavailableError);

      router.setOnline(true);
      const result = router.route(OperationType.Rewrite, false);
      expect(result.target).toBe(ModelTarget.Sonnet);
    });
  });

  // ── LocalOnly + Offline ───────────────────────────────────────────

  describe('LocalOnly mode — offline is irrelevant', () => {
    it('should route to Local regardless of network status', () => {
      router.setMode(RoutingMode.LocalOnly);

      router.setOnline(false);
      const offlineResult = router.route(OperationType.Rewrite, false);
      expect(offlineResult.target).toBe(ModelTarget.Local);

      router.setOnline(true);
      const onlineResult = router.route(OperationType.Rewrite, false);
      expect(onlineResult.target).toBe(ModelTarget.Local);
    });
  });

  // ── Network Status Accessors ──────────────────────────────────────

  describe('Network status accessors', () => {
    it('should default to online', () => {
      expect(router.isOnline()).toBe(true);
    });

    it('should reflect setOnline changes', () => {
      router.setOnline(false);
      expect(router.isOnline()).toBe(false);

      router.setOnline(true);
      expect(router.isOnline()).toBe(true);
    });

    it('should expose current mode via getMode()', () => {
      expect(router.getMode()).toBe(RoutingMode.Auto);

      router.setMode(RoutingMode.LocalOnly);
      expect(router.getMode()).toBe(RoutingMode.LocalOnly);
    });
  });
});
