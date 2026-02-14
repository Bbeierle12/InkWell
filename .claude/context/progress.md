---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-14T21:14:34Z
version: 2.0
author: Claude Code PM System
---

# Progress: Inkwell

## Current Status: Implementation Phase 5 — Claude API Integration Complete

Phases 1-5 TDD scaffolding complete. Implementation Phases 2-5 complete. Phase 5 connected the deterministic pipeline to the real Claude API: prompt templates for all 4 operations (rewrite/summarize/expand/critique), Claude client enhanced with `cache_control` + `anthropic-beta` header for prompt caching, structured response parser (stream text → `AIEditInstruction[]`), real token counting via `/v1/messages/count_tokens` API with heuristic fallback, full `DocumentAIServiceImpl` orchestration layer, SlashCommands ProseMirror extension with floating command palette, and web app wiring (Editor component, useDocumentAI/useGhostText hooks, singleton service). All 563 TypeScript tests + 57 Rust tests pass: `@inkwell/editor` (190), `@inkwell/document-ai` (285), `@inkwell/mcp-workspace` (55), `@inkwell/shared` (15), `@inkwell/evals` (18), and `inkwell-desktop` (57 Rust).

## Completed Work

### TDD Phase 1 — Editor Core + Router (2026-02-14)

**Section 1.1: ProseMirror Schema Tests (136 tests)**
- 121 deterministic tests covering all 12 node types, 6 mark types, nesting rules, content rules, serialization round-trips, edge cases
- 15 property-based tests using fast-check (10K+ iterations) verifying schema validity and serialize-deserialize stability across arbitrary documents

**Section 2.1: Model Router + Privacy Canary (50 tests)**
- 40 router tests: Auto/LocalOnly/CloudOnly mode routing, private document protection, mode switching, concurrent routing, offline fallback, online restoration, CloudOnly fail-if-offline, network status accessors
- 10 canary tests: Privacy canary detection in MSW interceptor, per-operation verification, no false positives
- Implemented `ModelRouter.route()` with privacy-first routing logic
- Added `setOnline()/isOnline()` network awareness, `CloudUnavailableError` for CloudOnly+offline

**Section 1.2: Transaction Integrity + AI Undo (21 tests)**
- 9 transaction integrity tests: insertText, delete, replaceWith, undo/redo (20 edits), step mapping, failure recovery, large document (100 para), 10,000-node stress test (<100ms/tx), composition
- 3 property-based transaction tests (10K iterations each): arbitrary insertions, serialize-deserialize stability, undo-redo exact state
- 9 AI undo tests: multi-step collapse to single undo, exact state restoration, redo, non-AI history preservation, selective undo (User A → AI B → User C), redo atomicity after AI undo
- Implemented `AIOperationSession` with three-phase commit pattern (revert → replace → closeHistory)
- Created `packages/editor/src/transactions/index.ts` — utility module (clampPosition, safeInsertText, safeDelete, assertSchemaValid, applyAndValidate, mapPosition)

**Section 1.3/1.4: Ghost Text + Collaboration (21 tests)**
- 11 ghost text tests: decoration rendering, never-serialize invariant, auto-clear on typing, stability threshold (Levenshtein), undo stack isolation, multiple concurrent decorations, TTFT instrumentation
- 6 origin filter tests: local/remote origin classification for Y.js changes
- 4 Y.js conflict resolution tests: concurrent edits, deterministic ordering, delete/insert conflicts, offline sync
- Implemented `GhostText` TipTap extension with TTFT measurement (`getGhostTextTTFT()`, `clearGhostTextTTFT()`), `originFilter()`, `createCollaborationDoc()`

**Invariants Covered:**
`schema-valid-after-operation`, `serialize-deserialize-stable`, `decorations-never-serialized`, `undo-redo-exact-state`, `ai-ops-single-undo-step`, `private-docs-never-reach-cloud`, `ghost-text-no-flicker`, `remote-changes-no-suggestion-trigger`

### TDD Phase 2 — DocumentAI Runtime (2026-02-14)

**Section 2.2: Queue Manager (74 tests)**
- QueueManager: priority ordering, FIFO for equal priority, contentHash dedup, same-operation-type cancellation, cancelAll with AbortController cleanup (40 tests)
- TokenBudgetTracker: sliding-window per-minute enforcement, expiry cleanup, canSpend/record
- BackpressureManager: pause/resume state machine, onStateChange callbacks
- Debouncer: configurable window (default 500ms), rapid-fire collapsing, cancel, pending state, teardown (14 tests)
- DocumentAIQueue: integrated orchestration of QueueManager + TokenBudgetTracker + BackpressureManager + Debouncer; submit()/enqueueImmediate(), budget enforcement, backpressure auto-pause, teardown with no orphaned callbacks (20 tests)

**Section 2.3: Context Manager (47 tests)**
- ContextManager.build(): stable/volatile splitting, token counting (~4 chars/token), cacheKey (djb2 hash)
- PrefixCache: memoization with invalidation
- analyzeStyle(): formality/sentenceLength/vocabulary/tone heuristics
- slidingWindow(): cursor-relative extraction, 50/50 budget split, edge cases

**Section 2.4: Edit Reconciler (45 tests — 38 unit + 7 property) [Enhanced in Phase 4]**
- Reconciler.parse(): JSON parsing with structural validation, fail-safe empty array return
- Reconciler.apply(): pre-validation, position remapping, end-to-start sorting, ProseMirror doc.replace()
- remapPosition(): insertion/deletion/replacement offset mapping
- validateInstructions(): structural validation (never throws)
- 7 property-based tests (fast-check): never-throw guarantees, non-negative positions, doc.check() validity

**Invariants Covered in Phase 2:**
`queue-respects-token-budget`, `no-orphaned-streams-after-close`, `token-counts-match-claude-tokenizer`, `reconciler-valid-or-reject`, `stream-errors-no-partial-edits`

### Implementation Phase 4 — Edit Reconciler Enhancement (2026-02-14)

**Section 2.4 Enhanced: Edit Reconciler (74 tests — 64 unit + 10 property)**
- `ReconcileResult` typed return: `ReconcileSuccess { ok, doc, applied }` / `ReconcileFailure { ok, reason, message, instructionIndex? }`
- `ReconcileRejectionReason` enum: ValidationFailed, OverlappingRanges, StalePositionDeleted, InvalidMarkType, SchemaViolation, ApplyError
- `detectOverlaps()`: sweep-line algorithm for range overlap detection (allows dual inserts at same point)
- `isPositionInDeletedRange()`: detects stale positions within purely-deleted concurrent ranges
- Schema-aware mark validation: verifies mark types exist in ProseMirror schema before apply
- Concurrent reconciliation: A applies, B applies against A's output with position remapping
- Formatting preservation: marks on unchanged portions survive adjacent replacements
- Transaction atomicity: multi-instruction batch where last fails leaves doc unchanged
- 10 property-based fuzz tests at 10,000 iterations each: never-throw, non-negative positions, doc.check(), immutability, no partial corruption, remapped positions non-negative, rejected edits leave doc identical

**Diff Preview Extension (Decision 1-3-1b: Option C — 8 tests)**
- `DiffPreviewPluginKey` + meta-based protocol (same pattern as ghost-text)
- `Decoration.inline` with `inkwell-diff-delete` class for deletions (red strikethrough)
- `Decoration.widget` with `inkwell-diff-insert` class for insertions (green underline)
- Floating Accept/Reject toolbar widget
- Auto-clear on user typing (docChanged), undo stack not polluted during preview
- 7 tests: deletion decorations, insertion widgets, replace (both), accept, reject, undo isolation, auto-clear, toolbar rendering

### TDD Phase 3 — Claude API Integration (2026-02-14)

**Section 4.1: Claude API Contract Tests (4 tests — stubs → real assertions)**
- Request format validation: model, messages, max_tokens, stream:true
- Streaming content_block_delta parsing → yields text deltas
- message_stop event handling → generator completes
- Required headers verification: x-api-key, anthropic-version, content-type

**Section 4.1: Stream Error Handling (8 tests — stubs → real assertions)**
- HTTP 429/529 → ClaudeAPIError with status and error type
- Stream timeout → StreamTimeoutError via STREAM_TIMEOUT_MS
- Malformed response body → graceful handling (no crash)
- HTTP 200 with mid-stream error event → ClaudeAPIError after partial content
- Stream without message_stop → completes with partial text (no hang)
- Abrupt stream termination → completes with partial text (no hang)
- No partial edits after stream error (Invariant: stream-errors-no-partial-edits)

**Section 4.1: Stop Reason Handling (3 tests — stubs → real assertions)**
- end_turn → generator completes normally with all text
- max_tokens → generator completes with truncated text
- stop_sequence → generator completes normally

**Source Implementations:**
- `ClaudeClient` — AsyncGenerator streaming client with SSE parsing, abort signal, typed errors
- `parseSSEStream` — Direct SSE parser using ReadableStream + TextDecoder (no eventsource-parser)
- `estimateTokens` / `countTokens` — Heuristic token counting (~4 chars/token)
- `ClaudeAPIError`, `StreamError`, `StreamTimeoutError` — Custom error classes

**Invariants Covered in Phase 3:**
`no-orphaned-streams-after-close`, `stream-errors-no-partial-edits`, `token-counts-match-claude-tokenizer`

### TDD Phase 4 — Local Inference + Bridge (2026-02-14)

**Section 3.1: LlamaEngine — llama.cpp Bindings (16 unit + 3 integration = 19 tests)**
- `LlamaEngine` wrapping `LlmBackend` trait with `Mutex<LlamaInner>` for thread safety
- Model lifecycle: load → validate (.gguf extension, file exists) → generate → unload
- Path validation: nonexistent → `ModelNotFound`, wrong extension → `InvalidFormat`
- Generation guards: empty prompt rejected, max_tokens=0 rejected
- Backend error propagation: load errors, generate errors pass through cleanly
- Reload behavior: loading a new model unloads the previous one
- Thread safety: concurrent `is_loaded()`/`metadata()` reads from 4 threads
- Integration: full lifecycle test, 8-thread concurrent generation, token limit enforcement
- `MockLlmBackend` with atomic counters, configurable errors, simulated delays
- `GenerationParams` (max_tokens, temperature, top_p, stop_sequences) and `GenerationResult`

**Section 3.2: WhisperEngine — whisper.cpp Bindings (14 unit + 4 integration = 18 tests)**
- `WhisperEngine` wrapping `SttBackend` trait with `Mutex<WhisperInner>` for thread safety
- Model lifecycle: load → validate (.bin extension) → transcribe → unload
- Audio validation: empty buffer → error, too short (<100ms) → error, NaN/Inf → error, too long (>10min) → error
- Silence detection: `is_silence()` utility, silence input → empty transcription text
- Language hint passthrough: None → auto-detect, Some("es") → passed to backend
- Backend error propagation, unload idempotency
- Integration: full lifecycle, empty/silence/short audio handling, language detection, 4-thread concurrent transcription
- `MockSttBackend` with configurable errors and language detection
- `TranscriptionResult` (text, language, confidence, duration_ms)

**Section 3.3: Bridge Throughput — Tauri Commands (20 unit + 4 integration = 24 tests)**
- `InferenceRequest/Response`, `TranscribeRequest/Response`, `SystemInfo`, `BridgeError` — all with Serialize+Deserialize
- `validate_inference_request()`: empty prompt, zero/excessive max_tokens, temperature [0,2], top_p [0,1]
- `validate_transcribe_request()`: empty path, language code length [2,5]
- Full serde roundtrip for all 6 bridge types (serialize → deserialize → equality check)
- BridgeError JSON serialization for clean JS error consumption
- Boundary value tests: max_tokens=1, max_tokens=16384, temperature=0.0/2.0
- Integration: 16-thread concurrent serialize/validate/roundtrip
- `get_system_info()`: platform detection, GPU heuristic, memory reporting
- Tauri `#[tauri::command]` handlers with validation-first error handling
- Criterion benchmarks: request serialization, response deserialization, audio validation overhead, bridge roundtrip throughput

**Source Implementations (Rust):**
- `inference/mod.rs` — `InferenceError` enum (7 variants), `LlmBackend` trait, `SttBackend` trait, `GenerationParams`, `GenerationResult`, `TranscriptionResult`, `ModelMetadata`
- `inference/llama.rs` — `LlamaEngine` (Arc<Mutex<LlamaInner>>), `MockLlmBackend`
- `inference/whisper.rs` — `WhisperEngine` (Arc<Mutex<WhisperInner>>), `MockSttBackend`, `is_silence()`
- `bridge/commands.rs` — Bridge types, validators, Tauri command handlers, `detect_gpu()`, `get_available_memory_mb()`
- `lib.rs` — cfg(test) guard for `generate_context!()` macro (enables test compilation without Tauri frontend)
- `tauri.conf.json` — Minimal Tauri 2.x config for compilation
- `benches/inference_bench.rs` — Serialization + audio validation benchmarks
- `benches/bridge_bench.rs` — Bridge roundtrip throughput benchmarks

### Scaffolding (2026-02-13)

- Created monorepo root configuration (pnpm workspaces, turborepo, CI workflows)
- Scaffolded all 8 packages with placeholder implementations and test skeletons
- Created VCR fixtures, documentation (ARCHITECTURE, TEST-PLAN, INVARIANTS, PROMPTS)
- Post-scaffolding fixes: workspace deps, tsconfig, jsdom, shared test file

### TDD Phase 5 — MCP Workspace + Evals + Voice Pipeline (2026-02-14)

**Section A: Shared Types + Voice Pipeline (15 tests in shared)**
- Added MCP types: `SearchResult`, `AnalysisResult`, `StyleGuideResult`, `MCPServerConfig`
- Added voice pipeline types: `VoicePipelineState`, `VoicePipelineEvent`, `VoicePipelineContext`, `VoicePipelineTransition`
- Voice pipeline FSM: transition table + `transition()` function
- 10 voice pipeline tests: happy path (Idle→Recording→Transcribing→Refining→Done), error transitions, reset, invalid transitions

**Section B: Evals (16 tests)**
- `compare.ts`: exactMatch, cosineSimilarity (bag-of-words TF), bleuScore (modified BLEU-4), rougeL (LCS F1), overallScore (weighted 0.1/0.3/0.3/0.3)
- 12 compare tests covering all metrics and edge cases
- 4 structural eval tests (Tier 1): JSON output validation, forbidden phrase detection, token budget enforcement, markdown structure preservation

**Section C: MCP Workspace (55 tests across 9 test files)**
- Chunker: sliding window with configurable overlap (8 tests)
- VectorStore: SQLite-backed with graceful sqlite-vec fallback for Windows (9 tests)
- FileWatcher: injectable fs module for testability (6 tests)
- Indexer integration: real chunker + VectorStore with simpleEmbed helper (4 tests)
- Retrieval quality: keyword/semantic search + limit enforcement (3 tests)
- Protocol adapter: MCP version "2024-11-05" + JSON-RPC validation (6 tests)
- Tool functions: workspace-search, workspace-watch, document-analyze, document-style-guide (10 tests)
- MCP Server: McpServer with 4 registered tools via zod schemas (5 tests)
- Protocol compliance: Client + InMemoryTransport end-to-end testing (4 tests)

### Implementation Phase 5 — Claude API Integration (2026-02-14)

**Step 1: Prompt Templates (5 new files + tests)**
- `prompts/index.ts`: Template registry with `getPromptTemplate()` and `renderPrompt()` ({{placeholder}} substitution)
- `prompts/rewrite.ts`: Rewrite system/user prompts (JSON array of AIEditInstruction output)
- `prompts/summarize.ts`: Summarize prompts
- `prompts/expand.ts`: Expand prompts
- `prompts/critique.ts`: Critique prompts (non-editing: `{observations, suggestions}`)
- 8 prompt template tests

**Step 2: Claude Client Enhancements**
- Added `system` + `systemCacheControl` options to `ClaudeClient.stream()` — `cache_control: {type: "ephemeral"}` + `anthropic-beta: prompt-caching-2024-07-31` header
- New `response-parser.ts`: `parseAIResponse()` (JSON extraction with markdown code fence handling) + `collectAndParse()` (stream accumulator)
- Real token counting via `/v1/messages/count_tokens` API with `estimateTokens()` fallback

**Step 3: Contract Test Enhancements**
- +2 contract tests: abort signal propagation, cache_control header verification
- 6 response parser tests: valid/invalid JSON, code fences, collectAndParse
- 4 token counter tests: heuristic, API call (MSW), fallback on error

**Step 4: Tier 1 Eval Enhancement**
- +2 structural eval tests: encoding correctness (no HTML entities/null bytes/replacement chars), required fields with correct types
- Added summarize + expand golden imports

**Step 5: DocumentAIServiceImpl (orchestration layer)**
- `service.ts`: Full pipeline — route → buildContext → getPromptTemplate → renderPrompt → client.stream → collectAndParse
- 5 service tests: routing, context building, full rewrite pipeline (MSW), destroy guard, cache_control

**Step 6: SlashCommands Extension (full implementation)**
- ProseMirror plugin: `/` trigger detection, query filtering, ArrowUp/Down navigation, Enter executes, Escape dismisses
- Floating command palette widget decoration
- 4 tests using real TipTap Editor

**Step 7: Web App Wiring**
- `document-ai-instance.ts`: Real singleton with `DocumentAIServiceImpl`, reads `NEXT_PUBLIC_CLAUDE_API_KEY`
- `useDocumentAI.ts`: Full hook — executeOperation (selection → service → diff preview), acceptDiff (AIOperationSession), rejectDiff
- `useGhostText.ts`: Full hook — debounced inline suggestions, accept/dismiss
- `Editor.tsx`: TipTap useEditor with StarterKit + GhostText + DiffPreview + AIUndo + SlashCommands

## Verification Results

| Check | Result |
|-------|--------|
| `@inkwell/shared` tests | 15 passed (2 test files) |
| `@inkwell/editor` tests | 190 passed (10 test files) |
| `@inkwell/document-ai` tests | 285 passed (14 test files) |
| `@inkwell/mcp-workspace` tests | 55 passed (9 test files) |
| `@inkwell/evals` tests | 18 passed (2 test files) |
| `inkwell-desktop` Rust tests | 57 passed (0 warnings) |
| **Total tests** | **620 passed, 0 failed** |
| Typecheck (shared) | Clean |
| Typecheck (mcp-workspace) | Clean |
| Typecheck (evals) | Clean |

## Git Status

- Git repository initialized, 6 commits on `main` branch
- Working tree clean — all phases committed

## Immediate Next Steps

1. **E2E tests** (Playwright) — critical editing flows, AI flows, offline/online transitions
2. **Performance benchmarks** — TTFT targets, input latency, bridge throughput
3. **Tier 2/3 evals** — Local 8B judge + Claude-as-judge implementations
4. **Manual E2E test** — `.env.local` with API key → `pnpm dev` → test slash commands end-to-end
5. **TypeScript typecheck cleanup** — Fix editor/document-ai vitest globals in tsconfig

## Known Issues

- Audio fixtures are binary WAV files (RIFF headers present)
- Tauri `#[tauri::command]` handlers return `MODEL_NOT_LOADED` until engine state management is wired up
- TypeScript typecheck has pre-existing failures in editor/document-ai packages (vitest globals not in tsconfig — tests still pass)
- sqlite-vec native extension may not load on Windows — VectorStore falls back to non-vector search

## Update History
- 2026-02-14T01:00:04Z: Phase 1 TDD complete — 247 tests passing, 8 invariants covered
- 2026-02-14T01:18:04Z: Phase 2 TDD complete — 361 tests passing, 13 invariants covered
- 2026-02-14T02:25:16Z: Phase 3 TDD complete — 361 tests (15 stubs → real assertions), all 14 invariants covered
- 2026-02-14T02:44:00Z: Phase 4 TDD complete — 418 tests (361 TS + 57 Rust), local inference layer implemented
- 2026-02-14T17:19:48Z: Phase 5 TDD complete — 504 tests (447 TS + 57 Rust), MCP workspace + evals + voice pipeline
- 2026-02-14T18:21:06Z: Implementation Phase 2 complete — 509 tests (452 TS + 57 Rust), editor transaction layer hardened
- 2026-02-14T18:48:33Z: Implementation Phase 3 complete — 560 tests (503 TS + 57 Rust), DocumentAI runtime core (router network awareness, debouncer, integrated queue)
- 2026-02-14T19:47:43Z: Implementation Phase 4 complete — 593 tests (536 TS + 57 Rust), Edit reconciler enhanced (typed results, overlap detection, stale-deleted, schema validation, diff preview)
- 2026-02-14T20:40:52Z: Implementation Phase 5 complete — 620 tests (563 TS + 57 Rust), Claude API integration (prompt templates, response parser, DocumentAIServiceImpl, slash commands, web app wiring)
- 2026-02-14T21:14:34Z: All phases committed to main (6 commits). Working tree clean. Ready for E2E/eval phase.
