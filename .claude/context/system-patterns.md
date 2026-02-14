---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-14T02:44:00Z
version: 1.3
author: Claude Code PM System
---

# System Patterns: Inkwell

## Architectural Patterns

### 1. Monorepo with Clean Package Boundaries
- Each package has a single responsibility
- Dependencies flow upward: shared → editor/document-ai/mcp → apps
- No circular dependencies between packages
- Barrel exports at package roots

### 2. Decoration-Based AI Rendering [IMPLEMENTED + TESTED]
Ghost text is implemented as ProseMirror decorations, not document nodes:
- `GhostText` TipTap extension with `GhostTextPluginKey` manages `DecorationSet`
- AI suggestions never pollute the document model (Invariant #3 — 9 tests)
- Decorations are ephemeral — disappear on serialize
- Stability threshold (Levenshtein ratio < 0.4) prevents flicker (Invariant #13)
- Auto-clear on `tr.docChanged` (user typing)

### 3. Atomic AI Undo [IMPLEMENTED + TESTED]
AI operations that produce multiple editor steps are wrapped to undo atomically:
- `AIOperationSession` class captures pre-AI snapshot, applies intermediates, then two-phase commits
- Uses `markAsAIIntermediate(tr)` with `addToHistory: false` for streaming tokens
- `commit()` reverts to pre-AI state then replaces in one history-tracked transaction
- Results in single undo step for entire AI operation (Invariant #5 — 7 tests)

### 4. Request Priority Queue with Backpressure [IMPLEMENTED + TESTED]
DocumentAI uses a priority queue for AI requests:
- `QueueManager` with priority ordering, FIFO for equal priority, contentHash dedup
- `TokenBudgetTracker` sliding-window per-minute enforcement (Invariant #11 — 40 tests)
- `BackpressureManager` pause/resume state machine with callbacks
- All requests carry AbortControllers; `cancelAll()` aborts everything (Invariant #6)

### 5. Stable/Volatile Prompt Splitting [IMPLEMENTED + TESTED]
Prompts are split into two parts for Claude's prompt caching:
- `ContextManager.build()` produces `DocumentContext` with stable prefix and volatile suffix
- `PrefixCache` memoizes stable prefix per document with invalidation
- `analyzeStyle()` computes formality/tone/vocabulary heuristics (47 tests)
- `slidingWindow()` extracts cursor-relative context within token budget

### 6. Privacy Canary Pattern [IMPLEMENTED + TESTED]
Private documents embed a canary string (`CANARY_PRIVATE_DO_NOT_TRANSMIT`):
- `ModelRouter.route()` checks `isPrivate` first — always routes to `ModelTarget.Local`
- MSW interceptor throws fatal error if canary detected in outgoing requests
- 23 router tests + 10 canary tests verify defense-in-depth (Invariant #8)

### 7. VCR Fixture Testing [IMPLEMENTED + TESTED]
Claude API interactions use recorded fixtures:
- Success responses for each operation type (rewrite, summarize, expand, critique)
- Error responses (429, 529, timeout, malformed) — tested with typed `ClaudeAPIError`
- Streaming edge cases (200-but-error, no-message-stop, early-terminate) — 8 stream error tests
- MSW intercepts requests and replays fixture data
- `ClaudeClient.stream()` AsyncGenerator with SSE parsing, abort signal, typed errors
- `parseSSEStream()` direct SSE parser using ReadableStream + TextDecoder

### 8. Origin Filtering for Collaboration [IMPLEMENTED + TESTED]
Y.js collaboration uses origin filtering:
- `originFilter(origin)` classifies null/undefined as local, `'remote'` string as remote, objects with `isLocal` flag
- Local changes: trigger AI suggestions
- Remote changes: suppressed from triggering AI (Invariant #14 — 6 tests)
- Y.js CRDT convergence verified with 4 conflict resolution tests

## Design Decisions

### Source-Level Imports (No Build Step)
Packages point `main` and `types` to source TypeScript files (`./src/index.ts`). This avoids a build step during development — TypeScript is resolved at import time by bundlers and test runners.

### Static Export for Tauri
Next.js is configured with `output: 'export'` to produce a static site that Tauri loads as its frontend. This means no server-side rendering — all AI operations happen client-side or through Tauri's Rust bridge.

### Reconciler as Gatekeeper [IMPLEMENTED + TESTED]
The reconciler pattern ensures AI output integrity:
- `Reconciler.parse()` JSON → `AIEditInstruction[]` with structural validation
- `validateInstructions()` validates against schema (Invariant #10 — never throws)
- `remapPosition()` maps positions accounting for concurrent insertions/deletions
- `Reconciler.apply()` sorts end-to-start, applies via ProseMirror `doc.replace()`
- Rejects entirely on validation failure — no partial edits (Invariant #12 — 45 tests)

### 3-Tier Eval System
AI quality is evaluated at three levels:
- **Tier 1 (Structural)**: Fast regex/JSON checks at PR gate
- **Tier 2 (Local Judge)**: 8B model evaluates quality locally
- **Tier 3 (Cloud Judge)**: Claude evaluates quality (expensive, merge-only)

### 9. Trait-Based Inference Abstraction [IMPLEMENTED + TESTED]
Local inference engines use trait-based abstraction for testability:
- `LlmBackend` trait: `load()`, `generate()`, `unload()` — swappable between real FFI and mock
- `SttBackend` trait: `load()`, `transcribe()`, `unload()` — same pattern for speech-to-text
- `LlamaEngine(Arc<Mutex<LlamaInner>>)` wraps `Box<dyn LlmBackend>` with thread-safe state machine
- `WhisperEngine(Arc<Mutex<WhisperInner>>)` wraps `Box<dyn SttBackend>` with audio validation
- Path validation before FFI: file exists + correct extension (.gguf / .bin)
- Audio validation before FFI: empty, too short (<100ms), NaN/Inf, too long (>10min)
- `MockLlmBackend` / `MockSttBackend` with atomic counters and configurable errors (19 + 18 tests)

### 10. Bridge Validation Pattern [IMPLEMENTED + TESTED]
Tauri bridge commands validate before processing:
- `validate_inference_request()` and `validate_transcribe_request()` return `BridgeError`
- `BridgeError { code, message }` serializes to JSON for clean JS error consumption
- Validation runs before any engine access — fail fast at the boundary
- All bridge types implement `Serialize + Deserialize + PartialEq` for roundtrip testing
- `cfg(test)` guard on `tauri::generate_context!()` — enables `cargo test` without Tauri frontend build (24 tests)

## Data Flow

```
User types → Debounce (500ms) → Router → Queue → Context Assembly
    → Claude/llama.cpp → Stream → Reconciler → Transaction → Editor
    → Ghost Text / Diff Preview → User accepts/rejects
```

## Invariant Enforcement

14 system invariants are defined in `docs/INVARIANTS.md` and tracked in `packages/shared/src/constants.ts`. Each invariant has corresponding tests across the relevant packages.
