---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-15T01:20:41Z
version: 2.1
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
- AI suggestions never pollute the document model (Invariant #3 — 11 tests)
- Decorations are ephemeral — disappear on serialize
- Stability threshold (Levenshtein ratio < 0.4) prevents flicker (Invariant #13)
- Auto-clear on `tr.docChanged` (user typing)
- Multiple concurrent ghost text decorations supported at different positions
- TTFT instrumentation: `requestedAt` field in meta, `getGhostTextTTFT()` / `clearGhostTextTTFT()` API

### 3. Atomic AI Undo [IMPLEMENTED + TESTED]
AI operations that produce multiple editor steps are wrapped to undo atomically:
- `AIOperationSession` class captures pre-AI snapshot, applies intermediates, then three-phase commits
- Uses `markAsAIIntermediate(tr)` with `addToHistory: false` for streaming tokens
- `commit()` Phase 1: revert to pre-AI state; Phase 2: replace in one history-tracked transaction; Phase 3: `closeHistory()` to prevent next user edit from merging with AI group
- Results in single undo step for entire AI operation (Invariant #5 — 9 tests)
- Selective undo verified: User A → AI B (50 chunks) → User C → undo C → undo B atomically

### 4. Request Priority Queue with Backpressure [IMPLEMENTED + TESTED]
DocumentAI uses a priority queue for AI requests:
- `QueueManager` with priority ordering, FIFO for equal priority, contentHash dedup
- `Debouncer` with configurable window (default 500ms), rapid-fire collapsing to latest request
- `TokenBudgetTracker` sliding-window per-minute enforcement (Invariant #11)
- `BackpressureManager` pause/resume state machine with callbacks
- `DocumentAIQueue` integrated orchestration: submit() with debounce, enqueueImmediate() bypassing debounce, budget enforcement rejects when exhausted, automatic backpressure on budget consumption, teardown() cancels all timers and AbortControllers (74 tests total)
- All requests carry AbortControllers; `cancelAll()` aborts everything (Invariant #6)
- `teardown()` ensures no orphaned callbacks or timers after close (Invariant #7)

### 5. Stable/Volatile Prompt Splitting + Workspace Context [IMPLEMENTED + TESTED]
Prompts are split into two parts for Claude's prompt caching, with optional workspace snippets:
- `ContextManager.build()` is async, produces `DocumentContext` with stable prefix, volatile suffix, and workspace snippets
- When `WorkspaceRetriever` is configured and `tokenBudget` provided, retrieves cross-document snippets (20% of remaining budget via `WORKSPACE_SNIPPET_RATIO`)
- Formatted as `[Workspace Context]` header with file paths and relevance scores
- `PrefixCache` memoizes stable prefix per document with invalidation
- `analyzeStyle()` computes formality/tone/vocabulary heuristics (47+ tests)
- `slidingWindow()` extracts cursor-relative context within token budget

### 6. Privacy Canary Pattern [IMPLEMENTED + TESTED]
Private documents embed a canary string (`CANARY_PRIVATE_DO_NOT_TRANSMIT`):
- `ModelRouter.route()` checks `isPrivate` first — always routes to `ModelTarget.Local`
- Private override takes priority over all other routing — even CloudOnly+offline never throws for private docs
- MSW interceptor throws fatal error if canary detected in outgoing requests
- 40 router tests + 10 canary tests verify defense-in-depth (Invariant #8)

### 6b. Network-Aware Routing [IMPLEMENTED + TESTED]
ModelRouter tracks network availability for offline/online transitions:
- `setOnline(false)` → Auto mode falls back all cloud operations to Local; CloudOnly mode throws `CloudUnavailableError`
- `setOnline(true)` → cloud routing resumes immediately (online restoration)
- LocalOnly mode is unaffected by network status
- `isOnline()` accessor for UI status indicators

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
Next.js is configured with `output: 'export'` to produce a static site in `apps/web/out/`. Tauri's `frontendDist` is set to `../../web/out` (relative to `src-tauri/`) to load this export. This means no server-side rendering — all AI operations happen client-side or through Tauri's Rust bridge. Build order: `pnpm --filter @inkwell/web build` first, then `cargo build` in `src-tauri/`.

### Reconciler as Gatekeeper [IMPLEMENTED + ENHANCED]
The reconciler pattern ensures AI output integrity:
- `Reconciler.parse()` JSON → `AIEditInstruction[]` with structural validation
- `Reconciler.apply()` returns typed `ReconcileResult` (discriminated union: `ReconcileSuccess | ReconcileFailure`)
- `ReconcileRejectionReason` enum: ValidationFailed, OverlappingRanges, StalePositionDeleted, InvalidMarkType, SchemaViolation, ApplyError
- `validateInstructions()` validates structure + schema-aware mark types (Invariant #10 — never throws)
- `detectOverlaps()` sweep-line algorithm rejects overlapping ranges (allows dual inserts at same point)
- `isPositionInDeletedRange()` detects stale positions within purely-deleted concurrent ranges
- `remapPosition()` maps positions accounting for concurrent insertions/deletions
- Sorts end-to-start, applies via ProseMirror `doc.replace()`, doc.check() validates result
- Rejects entirely on any failure — no partial edits (Invariant #12 — 74 tests including 10 fuzz at 10K iterations)

### Diff Preview (Decision 1-3-1b: Option C) [IMPLEMENTED + TESTED]
AI edit proposals are shown inline with a floating toolbar:
- `DiffPreviewPluginKey` + meta-based protocol (same pattern as ghost-text)
- `Decoration.inline` with `inkwell-diff-delete` for deletions (red strikethrough)
- `Decoration.widget` with `inkwell-diff-insert` for insertions (green underline)
- Floating Accept/Reject toolbar widget at first instruction position
- Decoration-only rendering — never modifies actual document, undo stack not polluted
- Auto-clear on `tr.docChanged` (user typing dismisses preview)
- 8 tests covering decorations, accept, reject, undo isolation, auto-clear, toolbar

### 3-Tier Eval System [TIER 1 IMPLEMENTED + TESTED]
AI quality is evaluated at three levels:
- **Tier 1 (Structural)** [IMPLEMENTED]: Fast regex/JSON checks at PR gate — forbidden phrase detection, JSON schema validation, token budget enforcement, structure preservation (4 tests)
- **Tier 2 (Local Judge)**: 8B model evaluates quality locally (stub)
- **Tier 3 (Cloud Judge)**: Claude evaluates quality (expensive, merge-only) (stub)
- **Comparison metrics** [IMPLEMENTED]: exactMatch, cosineSimilarity (bag-of-words TF), bleuScore (BLEU-4), rougeL (LCS F1), overallScore (weighted) — 12 tests

### 9. Trait-Based Inference Abstraction [IMPLEMENTED + TESTED]
Local inference engines use trait-based abstraction for testability:
- `LlmBackend` trait: `load()`, `generate()`, `generate_streaming()`, `unload()` — swappable between real FFI and mock
- `SttBackend` trait: `load()`, `transcribe()`, `transcribe_streaming()`, `unload()` — same pattern for speech-to-text
- `LlamaEngine(Arc<Mutex<LlamaInner>>)` wraps `Box<dyn LlmBackend>` with thread-safe state machine
- `WhisperEngine(Arc<Mutex<WhisperInner>>)` wraps `Box<dyn SttBackend>` with audio validation
- `RealLlmBackend` (behind `local-llm` feature): llama-cpp-2 v0.1.133 FFI with `LlamaSampler` chain (temp/top_p/dist or greedy), `LlamaBatch` for prompt evaluation
- `RealSttBackend` (behind `local-stt` feature): whisper-rs for speech-to-text (currently broken on Windows)
- `StubLlmBackend` / `StubSttBackend`: returns helpful error messages when features not enabled
- Granular Cargo features: `local-llm` (just LLM), `local-stt` (just STT), `local-inference` (both)
- `lib.rs` uses independent `#[cfg(feature = "local-llm")]` / `#[cfg(feature = "local-stt")]` guards for `create_app_state()`
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

### 11. MCP Workspace Server [IMPLEMENTED + TESTED]
MCP workspace context layer provides AI with document awareness:
- `McpServer` from MCP SDK with 4 registered tools via zod schemas (5 tests)
- `workspace-search`: bag-of-words embedding → VectorStore.search() → SearchResult[] (3 tests)
- `workspace-watch`: FileWatcher delegation for directory monitoring (2 tests)
- `document-analyze`: pure text analysis (word/sentence/paragraph counts, headings, reading level) (3 tests)
- `document-style-guide`: heuristic tone/formality/vocabulary detection (2 tests)
- Protocol compliance tested with Client + InMemoryTransport (4 tests)

### 12. Document Chunking + Vector Search [IMPLEMENTED + TESTED]
Documents are split and indexed for retrieval:
- `chunkDocument()`: sliding window with configurable overlap (default 500 chars, 50 overlap) (8 tests)
- `VectorStore`: SQLite-backed with optional sqlite-vec extension; graceful fallback on Windows; stores content alongside vectors (9 tests)
- `simpleEmbed()`: bag-of-words hash → 384-dim normalized vector, extracted to `indexer/embed.ts` shared module (Decision 8-1)
- `FileWatcher`: injectable fs module via constructor for testability (6 tests)
- `WorkspaceIndexer`: orchestrator wiring FileWatcher + chunker + simpleEmbed + VectorStore, implements `WorkspaceRetriever` interface (8 tests)

### 18. Workspace Context Integration [IMPLEMENTED + TESTED]
MCP workspace retrieval is wired into the DocumentAI pipeline for cross-document context:
- `WorkspaceRetriever` interface: `retrieve(query, maxTokens) → Promise<WorkspaceSnippet[]>` (shared types)
- `WorkspaceIndexer` implements `WorkspaceRetriever` — indexes documents, retrieves relevant snippets within token budget
- `ContextManager` accepts optional `WorkspaceRetriever`; when present, allocates 20% of token budget for workspace snippets
- `DocumentAIServiceImpl` passes `workspaceRetriever` to ContextManager, includes formatted snippets in Claude request context
- Formatted output: `[Workspace Context]` header, per-snippet `--- path (score: X.XX) ---` sections
- Local-target operations (InlineSuggest) skip workspace retrieval
- 7 integration tests including MSW-captured Claude request verification

### 13. Voice Pipeline [FULLY IMPLEMENTED + TESTED]
Full voice-to-document pipeline: speak → transcribe locally via Whisper → refine with Claude → insert into document:
- **FSM**: States: Idle → Recording → Transcribing → Refining → Done (happy path); Any → Error on ErrorOccurred; Error/Done → Idle on Reset
- `transition(current, event)` returns `VoicePipelineTransition | null` for invalid transitions (10 tests in shared)
- **Audio Capture**: `audio-capture.ts` — getUserMedia at 16kHz mono + ScriptProcessorNode, linear interpolation resampling when browser doesn't honor sample rate, `AudioCaptureSession.stop()` returns concatenated Float32Array (5 tests)
- **Tauri Bridge**: `transcribe_audio_bytes` Rust command accepts `Vec<f32>` directly (no temp file), TS `transcribeAudioBytes()` converts Float32Array via `Array.from()` (5 Rust tests + 2 TS tests)
- **VoiceRefine**: Prompt template returns plain text (not JSON edit instructions); service collects raw text from stream; routes to Sonnet (or Local for private docs) (4 tests)
- **useVoicePipeline Hook**: Full orchestrator using FSM transitions, AbortController cancellation, offline fallback (raw transcript inserted if Claude fails), auto-reset to Idle after 500ms, inserts at `editor.state.selection.from` (8 tests)
- **VoiceInput Component**: State-driven UI (Idle: mic button, Recording: pulsing red + timer + cancel, Transcribing/Refining: spinner + cancel, Done: green flash, Error: message + dismiss), ARIA labels, desktop-only with `isTauriEnvironment()` check

### 14. Prompt Template System [IMPLEMENTED + TESTED]
AI operations use structured prompt templates:
- `getPromptTemplate(operation)` maps `OperationType` to `PromptTemplate { system, userTemplate }`
- `renderPrompt(template, vars)` performs `{{placeholder}}` substitution on userTemplate
- Each operation has its own template file: rewrite, summarize, expand, critique, voice-refine
- Rewrite/summarize/expand output: JSON array of `AIEditInstruction[]`
- Critique output: `{observations: string[], suggestions: string[]}` (non-editing)
- VoiceRefine output: plain text (cleaned transcription, not JSON)
- InlineSuggest has no template (local-only, no Claude call)
- 9 tests covering all operations, placeholder substitution, error cases

### 15. Response Parser Pattern [IMPLEMENTED + TESTED]
Streaming Claude output is parsed into structured instructions:
- `parseAIResponse(text)`: trims whitespace, extracts JSON from markdown code fences, validates via `validateInstructions()`
- `collectAndParse(stream)`: accumulates all deltas from AsyncGenerator, then parses
- Reuses `validateInstructions()` from reconciler (no duplication)
- Returns `[]` on any parse/validation error (fail-safe, never throws)
- 6 tests covering valid/invalid JSON, code fences, collectAndParse

### 16. DocumentAIServiceImpl Orchestration [IMPLEMENTED + TESTED]
Full pipeline orchestration from operation request to edit instructions:
- `route(operation)` → ModelRouter routing decision
- `buildContext(docContent, cursorPos)` → ContextManager context assembly
- `getPromptTemplate(operation)` + `renderPrompt()` → system + user messages
- `client.stream(messages, {system, systemCacheControl})` → streaming deltas
- `collectAndParse(stream)` → `{raw, instructions}`
- Local targets (InlineSuggest) skip Claude call, return empty result
- `destroy()` tears down all resources; subsequent calls throw
- 5 tests with MSW mocks

### 17. SlashCommands Extension [IMPLEMENTED + TESTED]
ProseMirror plugin for "/" command palette:
- `SlashCommandsPluginKey` + meta-based activation (same pattern as ghost-text/diff-preview)
- Plugin state: `active`, `query`, `triggerPos`, `filteredCommands`, `selectedIndex`
- `handleTextInput`: "/" after whitespace/start-of-line triggers command mode
- Navigation: ArrowUp/Down through filtered list, Enter executes, Escape dismisses
- Query parsing: first space splits command name from args (e.g., "/rewrite formal" → command="rewrite", args="formal")
- `Decoration.widget` renders floating command palette
- `onExecute(command, args, selection)` callback for integration
- 4 tests using real TipTap Editor with meta-based state transitions

## Data Flow

```
User types → Debounce (500ms) → Router → Queue → Context Assembly
    → Prompt Template → Claude Stream → Response Parser → Reconciler
    → Transaction → Editor → Ghost Text / Diff Preview → User accepts/rejects
```

## Invariant Enforcement

14 system invariants are defined in `docs/INVARIANTS.md` and tracked in `packages/shared/src/constants.ts`. Each invariant has corresponding tests across the relevant packages.
