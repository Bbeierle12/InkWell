# Inkwell Architecture Decisions

## Decision 1-3-1: Y.js Integration

**Date:** 2026-02-14T17:47:06Z
**Status:** Decided
**Context:** Phase 2 Task 2.5

### Problem

Y.js provides CRDT-based conflict resolution for concurrent user-vs-AI edits, but adds complexity. Is it needed for a single-player MVP?

### Options Evaluated

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Skip Y.js for now. Use simpler position mapping in the reconciler. Add Y.js when multiplayer is needed. | Less complexity, faster MVP | May need to rearchitect later; AI reconciler must handle all conflict cases manually |
| B | Integrate Y.js from the start in single-player mode. Use it as the conflict resolution substrate even without multiplayer. | Proven CRDT handles all edge cases; no rearchitecture when multiplayer ships; AI-vs-user conflicts resolved correctly by default | Overhead, learning curve |
| C | Integrate Y.js behind a feature flag. Test both paths. | Flexibility | Maintaining two code paths; double testing burden |

### Decision

**Option B: Integrate Y.js from the start.**

### Rationale

1. **AI-as-concurrent-editor is inherently a multiplayer problem.** Streaming AI edits that arrive while the user is typing produce the same class of conflicts as two human collaborators. Y.js solves this correctly out of the box via its CRDT merge semantics.

2. **Rearchitecture cost is high.** Building a custom position-mapping reconciler for Option A creates a maintenance burden and likely introduces edge-case bugs that Y.js's battle-tested CRDT avoids. When multiplayer ships later, the custom reconciler would be thrown away.

3. **Single-player overhead is minimal.** Y.js adds ~15KB gzipped. In single-player mode, there are no network round-trips — Y.js operates purely in-memory as a conflict resolution substrate. The performance impact is negligible (verified in §1.4 tests).

4. **Feature-flag path (Option C) doubles testing surface** without clear benefit. Since Y.js works correctly in single-player mode, maintaining a non-Y.js code path creates unnecessary complexity.

### Consequences

- Y.js is a required dependency of `@inkwell/editor`
- The `collaboration/` module provides `createCollaborationDoc()` and `originFilter()`
- AI operations must set appropriate Y.js origins so the origin filter can distinguish local AI edits from remote collaborative edits (Invariant #14)
- `y-indexeddb` provides offline persistence out of the box
- §1.4 tests validate conflict resolution under concurrent editing

### Validation

The following tests confirm this decision:
- `collaboration/__tests__/yjs-conflicts.test.ts` — 4 conflict resolution scenarios
- `collaboration/__tests__/origin-filter.test.ts` — 6 origin detection scenarios
