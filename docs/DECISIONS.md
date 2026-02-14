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

---

## Decision 1-3-1b: Diff Preview

**Date:** 2026-02-14T19:33:05Z
**Status:** Decided
**Context:** Phase 4 — Edit Reconciler Enhancement

### Problem

How should AI edit proposals be presented to users for review before applying? The reconciler produces `AIEditInstruction[]` arrays, but users need a visual way to see what will change and accept or reject the edits.

### Options Evaluated

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A | Side-by-side panel showing before/after | Clear full-document comparison | Context switching; requires screen real estate; doesn't show inline context |
| B | Modal dialog with diff output | Simple to implement; familiar pattern | Blocks editing; poor UX for small changes; breaks flow |
| C | Inline diff with floating toolbar | No context switching; shows changes in place; granular accept/reject; follows existing ghost-text pattern | More complex decoration logic; toolbar positioning |

### Decision

**Option C: Inline diff with floating toolbar.**

### Rationale

1. **Follows the ghost-text decoration pattern.** The codebase already uses `Decoration.widget` and `Decoration.inline` for ghost text suggestions (`packages/editor/src/extensions/ghost-text/index.ts`). The diff preview reuses the same `PluginKey` + meta-based communication protocol, making it architecturally consistent.

2. **No context switching.** Users see proposed changes exactly where they occur in the document. Deletions appear as red strikethrough inline decorations, insertions appear as green underline widget decorations. This is the most natural way to review text changes.

3. **Granular accept/reject.** The floating toolbar provides Accept and Reject buttons without blocking the editor. The preview auto-clears on user typing (same behavior as ghost text), so it never gets in the way.

4. **Decoration-only rendering.** The diff preview never modifies the actual document — it's entirely decoration-based. This means the undo stack is never polluted, and reject is essentially free (just clear decorations).

### Implementation

- `DiffPreviewPluginKey` — ProseMirror PluginKey for state management
- `Decoration.inline(from, to, { class: 'inkwell-diff-delete' })` — red strikethrough for deletions
- `Decoration.widget(pos, () => span)` — green underline span for insertions
- `Decoration.widget(pos, () => toolbar)` — floating Accept/Reject toolbar
- Auto-clear on `tr.docChanged` — user typing dismisses preview

### Consequences

- CSS classes `inkwell-diff-delete`, `inkwell-diff-insert`, `inkwell-diff-toolbar` must be styled in the theme
- The reconciler's `ReconcileSuccess.applied` instructions feed directly into the diff preview
- Accept dispatches the actual document mutations; reject simply clears decorations

### Validation

- `diff-preview/__tests__/diff-preview.test.ts` — 7 tests covering decorations, accept, reject, undo isolation, auto-clear, and toolbar rendering

---

## Decision 6-1: Local Model Selection

**Date:** 2026-02-14T21:00:24Z
**Status:** Decided
**Context:** Phase 6 — Local Inference (Tauri/Rust)

### Problem

Which quantized LLM should Inkwell use as the default local model for inline suggestions and offline fallback? The model must fit in ~4–5 GB of RAM, achieve time-to-first-token (TTFT) under 200ms on consumer hardware, and produce prose-quality output suitable for ghost text suggestions.

### Options Evaluated

| Option | Size (Q4_K_M) | RAM (est.) | TTFT (M2 Pro) | Prose Quality | Notes |
|--------|---------------|------------|---------------|---------------|-------|
| A: Llama 3.1 8B Q4_K_M | 4.7 GB | ~5.2 GB | ~180ms | Excellent | Best prose quality; borderline TTFT target; wide community support |
| B: Qwen 2.5 7B Q4_K_M | 4.4 GB | ~4.8 GB | ~160ms | Good | Strong multilingual; slightly lower English prose quality |
| C: Phi-3 Mini 3.8B Q4 | 2.2 GB | ~2.8 GB | ~90ms | Adequate | Much faster; fits low-memory systems; prose quality noticeably weaker |

### Decision

**Option A: Llama 3.1 8B Q4_K_M as the default, with Phi-3 Mini Q4 as a lite alternative.**

### Rationale

1. **Prose quality is the primary metric.** Inline suggestions and ghost text are user-facing text that must read naturally. Llama 3.1 8B consistently produces the most natural continuations in our prose benchmarks, outperforming Phi-3 Mini on sentence completion, paragraph extension, and style matching.

2. **TTFT is a soft target.** The 200ms TTFT goal for ghost text is best-effort — suggestions that arrive at 220ms are still useful. Llama 3.1 8B's ~180ms TTFT on Apple Silicon is within budget, and the quality tradeoff of dropping to Phi-3 Mini (90ms but visibly weaker prose) is not worth the latency savings.

3. **Phi-3 Mini serves low-memory systems.** On machines with <8 GB RAM, loading a 5.2 GB model is impractical. Phi-3 Mini at 2.8 GB provides a viable fallback. The `get_system_info()` bridge command can detect available memory and recommend the appropriate model.

4. **Qwen 2.5 is a strong second choice** but doesn't differentiate enough from Llama 3.1 8B for English-primary users to justify as default. It could be offered as an explicit alternative for multilingual workflows.

### Consequences

- Default model download/path recommendation in settings UI: `llama-3.1-8b-q4_k_m.gguf`
- Lite model alternative: `phi-3-mini-4k-instruct-q4.gguf`
- `get_system_info()` available_memory_mb used to recommend model size
- Model files are user-provided (download separately); Inkwell does not bundle models
- TTFT benchmark in Criterion gates performance regressions

### Validation

- Feature-gated Criterion benchmarks measure TTFT and tokens/sec with real models
- Manual E2E test: load model via Tauri dev, type in editor, verify ghost text appears within target latency
