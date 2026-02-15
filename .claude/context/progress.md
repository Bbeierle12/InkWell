---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-15T06:42:47Z
version: 2.8
author: Claude Code PM System
---

# Progress: Inkwell

## Current Status: Phase 11 E2E Testing, Evals & Performance — Fully Implemented

Phases 1-10 complete. Phase 11 fills all test gaps: 21 Playwright E2E specs (editing, AI UI, offline/online, performance), Tier 2 deterministic local judge with heuristic scoring, Tier 3 cloud judge (Claude-as-Judge) with MSW-mocked tests. All 784 tests pass (700 TS + 84 Rust). 32 eval tests pass (12 compare + 6 Tier 1 + 8 Tier 2 + 6 Tier 3).

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

### TDD Phase 5 — MCP Workspace + Evals + Voice Pipeline Types (2026-02-14)

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

### Phase 8 — MCP Workspace Context Integration (2026-02-15)

**Decision 8-1: Embedding Strategy — Option A: Bag-of-words hash embedding (`simpleEmbed`)**
- Already implemented and tested in Phase 5. No new dependencies. Adequate for keyword-overlap retrieval.
- Semantic quality upgradeable later by swapping `WorkspaceRetriever` implementation.

**Shared Types + Constants**
- `WorkspaceSnippet { content, path, score }` and `WorkspaceRetriever { retrieve(query, maxTokens) }` interfaces
- `workspaceSnippets: string` field added to `DocumentContext`
- `WORKSPACE_SNIPPET_RATIO = 0.2` constant (20% of remaining token budget)

**VectorStore Content Storage Fix**
- Added `content: string` to `VectorSearchResult` interface and `insert()` method (backward compatible default `''`)
- Updated `search()` SQL to SELECT and return content in both vec and fallback paths

**simpleEmbed Extraction**
- Moved `simpleEmbed()` from `workspace-search.ts` to new `indexer/embed.ts` shared module
- Updated `workspace-search.ts` to import from shared module and return `r.content`

**WorkspaceIndexer (NEW)**
- Orchestrator implementing `WorkspaceRetriever`: FileWatcher + chunker + simpleEmbed + VectorStore
- `indexDocument(path, content)` — chunk, embed, insert with content
- `retrieve(query, maxTokens)` — embed query, search (limit 10), accumulate within token budget (~4 chars/token)
- `initialize(dbPath)`, `close()`, `onFileChange(path)` lifecycle methods

**ContextManager Async + Workspace Retrieval**
- `build()` now async: `async build(docContent, cursorPos, docId?, tokenBudget?): Promise<DocumentContext>`
- When retriever present AND tokenBudget provided: computes snippet budget, queries retriever, formats snippets with `[Workspace Context]` header and file paths/scores
- Token count includes workspace snippet length

**DocumentAIServiceImpl Workspace Integration**
- Added `workspaceRetriever?: WorkspaceRetriever` to options
- `getTokenBudget()` helper maps operation types to TOKEN_BUDGETS
- All `build()` calls awaited with tokenBudget; workspace snippets included in Claude request context
- `buildContext()` return type → `Promise<DocumentContext>`

**Tests (15 new + ~30 async conversions)**
- `workspace-indexer.test.ts` (8 tests): indexDocument, retrieve sorted by score, token budget, empty query, zero budget, no docs, throws before init, close resources
- `workspace-integration.test.ts` (7 tests): snippets included, no retriever = empty, no budget = empty, token count includes snippets, query passed to retriever, snippets in Claude request (MSW capture), Local target skips retrieval
- ~30 existing `cm.build()` calls in context.test.ts made async
- indexer.test.ts and retrieval.test.ts updated to pass content to `insert()` and import from `embed.ts`

### Implementation Phase 7 — Voice Pipeline (2026-02-15)

**VoiceRefine Prompt Template**
- `prompts/voice-refine.ts`: System prompt for cleaning filler words, fixing punctuation, matching document style
- User template with `{{document_context}}`, `{{style_profile}}`, `{{raw_transcript}}`
- Returns plain text (not JSON edit instructions) — unique among all operation templates

**DocumentAI Service VoiceRefine Path**
- Added `rawTranscript?: string` to `AIOperationRequest`
- VoiceRefine collects raw text from stream (skips `collectAndParse` JSON parsing)
- Returns `{ instructions: [], raw: cleanedText, model }` for raw text operations
- Routes VoiceRefine to Sonnet (or Local for private docs)

**Tauri Bridge — transcribe_audio_bytes Command**
- `TranscribeAudioBytesRequest { samples: Vec<f32>, language: Option<String> }` — accepts PCM directly, no temp file
- Rust command validates samples (empty, too short, NaN/Inf) then passes to `state.stt.transcribe()`
- TS bridge: `transcribeAudioBytes(samples: Float32Array, language?: string)` — converts via `Array.from()` for Tauri serialization
- 5 new Rust tests for validation + type serialization

**Audio Capture Utility (NEW)**
- `audio-capture.ts`: Raw PCM mic capture at 16kHz mono
- `getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } })` + `AudioContext` + `ScriptProcessorNode`
- Linear interpolation resampling when browser doesn't honor 16kHz
- `AudioCaptureSession.stop()` → concatenated Float32Array, `.cancel()` → releases all resources

**useVoicePipeline Hook (full implementation, replaced stub)**
- Orchestrator: FSM `transition()` from `@inkwell/shared`, AbortController cancellation at every stage
- Pipeline: startRecording → stopRecording (transcribe → refine → insert) → auto-reset (500ms)
- Offline fallback: if Claude refinement fails, raw transcript inserted directly
- Inserts at `editor.state.selection.from` via `editor.chain().insertContentAt()`
- Checks `isTauriEnvironment()` for availability (desktop-only feature)

**VoiceInput Component (full implementation, replaced stub)**
- State-driven rendering: Idle (mic), Recording (pulsing red + timer + cancel), Transcribing (spinner), Refining (spinner), Done (green flash), Error (message + dismiss)
- ARIA labels and live regions throughout
- Recording timer updated at 200ms interval

**Editor Integration**
- `useVoicePipeline({ editor })` called after existing hooks
- `<VoiceInput pipeline={voicePipeline} />` rendered above editor content area

**Tests (27 new tests across 4 files)**
- `useVoicePipeline.test.ts` (8): FSM transitions (happy path, error, reset, invalid), bridge integration, VoiceRefine prompt template
- `audio-capture.test.ts` (5): mic constraints, chunk concatenation, resource cleanup (stop/cancel), permission denied
- `tauri-bridge-voice.test.ts` (2): transcribeAudioBytes null in non-Tauri (with/without language)
- `voice-refine.test.ts` (4): route to Sonnet, raw text return, rawTranscript in prompt, private → Local
- Updated `prompts.test.ts`: VoiceRefine "should return template" (was "should throw")
- 5 new Rust tests: TranscribeAudioBytesRequest validation and serialization

### Phase 9 — Web UI Polish (2026-02-15)

**Toolbar (full implementation)**
- Formatting buttons: Bold, Italic, Underline, Strikethrough, Code with active state tracking
- Heading selector: Paragraph, H1, H2, H3 via `<select>` element
- List buttons: Bullet list, Ordered list
- AI Operations dropdown: Rewrite, Summarize, Expand, Critique
- Voice button: Inline `<VoiceInput pipeline={...} />`
- Mode indicator: Online (green) / Offline (amber) chip

**BackpressureIndicator (full implementation)**
- Renders null when all states false (non-intrusive)
- Shows: "Suggestions paused" (amber), "Local mode" (blue), "AI thinking..." (gray pulse)
- Error display with retry button

**EditorArea (refactored from Editor.tsx)**
- Presentational component receiving editor as prop
- Conditional accept/reject buttons when diff preview active

**page.tsx restructure**
- Lifted `useEditor()` to page level with all extensions (StarterKit, Placeholder, Underline, GhostText, DiffPreview, AIUndo, SlashCommands)
- Props passed to Toolbar, BackpressureIndicator, EditorArea
- Setup screen check for first-run model download (Tauri only)

**Document persistence**
- `document-store.ts`: Zustand store with IndexedDB backend (save, load, list, delete)
- `useAutoSave.ts`: 30-second interval auto-save on editor update events

**Ghost Text Escape handler**
- Escape key dismisses ghost text suggestion (added to existing Tab handler)

**CSS additions**
- Toolbar button styles, active states, separators, mode chip, dropdown, dark mode variants

### Phase 10 — Desktop Packaging & Offline Mode (2026-02-15)

**Task 10.1: Rust Bridge Commands for Desktop**
- Added `rfd = "0.15"`, `dirs = "5"`, `reqwest = { version = "0.12", features = ["stream"] }`, `futures-util = "0.3"` to Cargo.toml
- File dialog commands: `save_file_dialog`, `open_file_dialog` (via `rfd::AsyncFileDialog`)
- File I/O commands: `write_text_file`, `read_text_file` (via `tokio::fs`)
- Model management: `get_models_dir` (platform-specific via `dirs::data_dir()`), `check_models_status`, `download_model` (streaming with progress events)
- Types: `FileFilter`, `ModelInfo`, `ModelsStatus`, `DownloadProgressEvent`
- 7 new Rust tests for type serialization/deserialization
- All 7 new commands registered in `lib.rs` invoke_handler

**Task 10.1b: Icons and Bundle Config**
- Generated placeholder PNG icons (32x32, 128x128, 128x128@2x) and icon.icns
- Updated `desktop/package.json` with build:debug, build:local-inference, typecheck, test scripts

**Task 10.2: TypeScript Bridge Functions**
- `tauri-bridge.ts`: Added `ModelInfo`, `ModelsStatus`, `DownloadProgressEvent` interfaces
- Bridge functions: `getModelsDir()`, `checkModelsStatus()`, `downloadModel(url, filename, onProgress?)`
- Download uses Tauri event listener for streaming progress from Rust

**Task 10.2b: SetupScreen Component (NEW)**
- First-run model download experience shown when desktop app launches without models
- Model catalog: llama-3.2-1b (0.8GB), llama-3.2-3b (2.0GB), whisper-base (142MB), whisper-small (466MB)
- Download state machine: idle → downloading (progress bar) → done / error
- Auto-skips when both model types already installed
- Skip Setup / Refresh Status buttons
- `formatBytes()` utility

**Task 10.3: Offline/Online Transition Handling**
- Enhanced `useDocumentAI.ts` with AbortController for mid-stream cancellation
- `lastError` state + `retryLastOperation()` callback
- Offline event aborts in-flight operations via `abortRef.current.abort()`
- Online event clears errors
- `BackpressureIndicator` updated with `lastError` and `onRetry` props

**Task 10.3b: Offline/Online Tests (39 new tests)**
- `BackpressureIndicator.test.ts` (8 tests): idle/null, paused, local mode, multi-state, error display, error hidden during processing, error + local mode
- `useDocumentAI-transitions.test.ts` (21 tests): connectivity tracker state machine (start offline/online, transitions, error clearing, abort in-flight, rapid toggling, new op aborts previous, stale endOperation safety), retry logic (track/clear/preserve/execute), model status check behavior
- `SetupScreen.test.ts` (18 tests): formatBytes (bytes/KB/MB/GB), download state machine (idle/downloading/progress/done/error), completion detection, model catalog validation

### Phase 11 — E2E Testing, Evals & Performance (2026-02-15)

**E2E Tests — Core Editing (8 tests)**
- Load editor (contenteditable visible), type and display text, bold formatting (`<strong>` + `aria-pressed`), italic formatting (`<em>`), undo/redo (Ctrl+Z/Y), heading levels (select → `<h1>`), list types (bullet → ordered toggle), copy/paste

**E2E Tests — AI UI Flows (5 tests)**
- Slash command palette (type `/` → `#inkwell-slash-menu` with 4 `role="option"` items)
- Slash menu navigation (ArrowDown changes `aria-selected`, Escape dismisses)
- Slash command filtering (type `/re` → only "Rewrite" shown)
- AI toolbar dropdown (4 `role="menuitem"`: Rewrite, Summarize, Expand, Critique)
- Online mode indicator (default `role="status"` shows "Online")

**E2E Tests — Offline/Online (4 tests)**
- Online initially, go offline (mode chip changes, BackpressureIndicator shows "Local mode"), recover online, edit while offline

**E2E Tests — Performance (4 tests)**
- Editor load < 2s, 100-char typing responsiveness (< 50ms/keystroke avg), 10K-word large document paste + verify, scroll stability (50 paragraphs + mouse wheel)

**Playwright Config**
- Default to Chromium-only (Firefox/WebKit commented out for speed)
- `timeout: 30_000` on webServer config

**Tier 2 — Deterministic Local Judge (8 tests)**
- `local-judge.ts`: Enhanced heuristic scoring using `compare()` cosine/BLEU/ROUGE-L metrics + operation-specific scorers
- Criteria loaded from `fixtures/judge-prompts.json` per operation type
- Heuristic scorers: meaning_accuracy (cosine+rougeL), fluency (words/sentence), brevity (output/input ratio), depth (expansion ratio), thoroughness/actionability (JSON array counting), etc.
- Signature: `localJudge(input, output, golden, operation)` — operation string replaces criteria array
- Tests: golden pairs score >= 6/10 for all 4 operations, wrong output < 5, empty output < 3, all scores 0-10, reasoning contains metrics

**Tier 3 — Cloud Judge with MSW (6 tests)**
- `cloud-judge.ts`: Claude API integration (POST to `/v1/messages`, model `claude-sonnet-4-5-20250929`)
- JSON extraction handles markdown code fences
- Descriptive error on missing `ANTHROPIC_API_KEY`
- `test-setup.ts`: MSW server for mocking Claude responses
- Tests: structured result, code-fenced JSON parsing, 401 error, unparseable response, missing API key, correct request body validation

**Evals Config**
- `vitest.config.ts`: globals enabled, 15s test timeout

### Frontend Plan — Phase 1: Surface Existing Backend (2026-02-15)

**Document Switcher / Sidebar**
- `Sidebar.tsx`: Collapsible sidebar shell with search, tag filter, sort control, document list, trash toggle
- `DocumentList.tsx`: Renders list of saved documents with title, relative time, preview
- `DocumentListItem.tsx`: Individual item with context menu (pin/delete), tag display, word count, confirm dialog
- `DocumentTitle.tsx`: Click-to-edit inline title in toolbar (Enter commits, Escape cancels)
- `ExportMenu.tsx`: Dropdown with Copy/Download Markdown, Tauri-only Save/Open file dialogs, toast notifications
- `StatusBar.tsx`: Save status (Unsaved/Saved), live word count, character count (subscribes to editor update events)

**Store Enhancements**
- `document-store.ts`: Added documents array, sidebarOpen, setTitle, toggleSidebar, setSidebarOpen, refreshDocuments
- `document-utils.ts`: New utility module — extractPreview, formatRelativeTime, countWords, countWordsFromContent, deriveTitleFromContent, tagColor

**Layout & Integration**
- `page.tsx`: Sidebar layout (flex row), auto-title from content, Ctrl+\ sidebar toggle, StatusBar below editor
- `Toolbar.tsx`: Sidebar toggle (hamburger), DocumentTitle, ExportMenu integration
- `globals.css`: Extensive CSS for sidebar, document list, title, export, status bar, dark mode

**Tests (53 new)**
- `document-store-v2.test.ts` (33 tests): extractPreview, formatRelativeTime, countWords, deriveTitleFromContent, store state
- `sidebar-components.test.ts` (20 tests): sorting, filtering, title logic, export, status bar, sidebar toggle

### Frontend Plan — Phase 2: Organization Layer (2026-02-15)

**Schema Migration v1→v2**
- `StoredDocument` extended: tags (string[]), pinned (boolean), deletedAt (number|null), wordCount (number)
- `DB_VERSION` bumped to 2 with `onupgradeneeded` handling
- `ensureV2Fields()` backfills v1 documents at read time for backward compatibility
- `SortMode` type: 'updated' | 'created' | 'title-az' | 'title-za'

**New Store Actions**
- softDelete, restore, permanentDelete (trash lifecycle)
- setTags, togglePin, getAllTags (organization)
- setSortMode, setSearchQuery, setActiveTagFilters, setShowTrash (filtering)
- `getFilteredDocuments()` pure selector: trash/search/tag AND filter + sort with pin-first priority
- `sortDocuments()` with pinned-first logic across all sort modes

**New Components**
- `SearchBar.tsx`: Debounced (200ms) search input updating store
- `TagFilter.tsx`: Horizontal chip bar for tag filtering with "All" clear button
- `TagInput.tsx`: Inline tag editor with autocomplete from existing tags
- `SortControl.tsx`: Dropdown for sort mode selection
- `TrashView.tsx`: Trash toggle button (TrashToggle export)

**Updated Components**
- `Sidebar.tsx`: Integrates SearchBar, TagFilter, SortControl, TrashToggle, uses getFilteredDocuments selector
- `DocumentList.tsx`: Added onRestore, isTrashView props
- `DocumentListItem.tsx`: Pin indicator (star), tag display (colored), trash actions (restore/delete forever), pin toggle in context menu, word count display

**CSS (Phase 2 additions)**
- Search bar, tag filter/chips/badges, tag input/suggestions, sort control, trash toggle, pin icon, doc-item-tags, doc-item-wc
- Full dark mode variants for all Phase 2 components

**Tests (32 new)**
- `schema-migration.test.ts` (21 tests): v1→v2 migration, soft delete/trash, tags CRUD+filter, pin/sort, sort controls, tagColor
- `filtered-documents.test.ts` (11 tests): getFilteredDocuments selector — trash, search, tags AND filter, pins, combined filters

## Verification Results

| Check | Result |
|-------|--------|
| `@inkwell/shared` tests | 15 passed (2 test files) |
| `@inkwell/editor` tests | 190 passed (10 test files) |
| `@inkwell/document-ai` tests | 303 passed (16 test files) |
| `@inkwell/web` tests | 182 passed (15 test files) |
| `@inkwell/mcp-workspace` tests | 63 passed (10 test files) |
| `@inkwell/evals` tests | 32 passed (4 test files) |
| `inkwell-desktop` Rust tests | 84 passed (0 warnings) |
| **Total tests** | **869 passed, 0 failed** (785 TS + 84 Rust) |
| E2E specs (Playwright) | 21 specs written (editing 8, AI 5, offline 4, perf 4) |
| Web build (`next build`) | Static export successful |
| Turbo pipeline | 12/12 tasks passed |
| Typecheck (shared) | Clean |
| Typecheck (mcp-workspace) | Clean |
| Typecheck (evals) | Clean |

## Git Status

- Git repository initialized, 8 commits on `main` branch
- Frontend Plan Phase 1+2 work + sidebar polish uncommitted (6 modified + 16 new files)

## Immediate Next Steps

1. **Commit Frontend Plan Phase 1+2 work** — 16 new files + 6 modified files ready to commit
2. **Frontend Plan Phase 3** — MCP integration, analytics dashboard, collaboration UI, vector search UI
3. **Tauri production build** — Test full `tauri build` pipeline on target platforms
4. **Model download URLs** — Populate MODEL_CATALOG URLs for actual model hosting (HuggingFace or self-hosted)
5. **Fix whisper-rs Windows build** — `whisper-rs-sys` bundled bindings are Linux-specific; needs MSVC include paths for fresh bindgen
6. **Run E2E tests against dev server** — `cd e2e && npx playwright test --project=chromium`

## Known Issues

- Audio fixtures are binary WAV files (RIFF headers present)
- Tauri `#[tauri::command]` handlers return `MODEL_NOT_LOADED` until a GGUF model is loaded via bridge command
- TypeScript typecheck has pre-existing failures in editor/document-ai packages (vitest globals not in tsconfig — tests still pass)
- sqlite-vec native extension may not load on Windows — VectorStore falls back to non-vector search
- `whisper-rs` v0.15 / `whisper-rs-sys` v0.14 fails to build on Windows — bundled bindings reference Linux-only types (`_G_fpos_t`, `_IO_FILE`); `local-stt` feature is currently unbuildable on Windows without MSVC dev shell for fresh bindgen
- Tailwind CSS v4 requires `@tailwindcss/postcss` instead of `tailwindcss` as PostCSS plugin

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
- 2026-02-14T22:06:59Z: Desktop runtime session — Fixed Tailwind v4 PostCSS plugin, updated llama-cpp-2 to v0.1.133 API, split Cargo features (local-llm/local-stt), added build.rs/icon/frontendDist path fix, installed LLVM for bindgen. 73 Rust tests pass. Desktop app launches with real Next.js frontend.
- 2026-02-15T00:16:36Z: Phase 7 Voice Pipeline — VoiceRefine prompt, service VoiceRefine path, Tauri transcribe_audio_bytes command, audio-capture utility, useVoicePipeline hook, VoiceInput component, Editor integration. 675 tests pass (597 TS + 78 Rust).
- 2026-02-15T01:20:41Z: Phase 8 MCP Workspace Context Integration — WorkspaceRetriever interface, WorkspaceIndexer orchestrator, async ContextManager.build() with workspace snippet retrieval, DocumentAIServiceImpl workspace integration, VectorStore content fix, simpleEmbed extraction. 691 tests pass (613 TS + 78 Rust).
- 2026-02-15T02:00:00Z: Phase 9 Web UI Polish — Toolbar (formatting, headings, lists, AI dropdown, voice, mode indicator), BackpressureIndicator, EditorArea refactor, page.tsx restructure (lifted useEditor), document-store (Zustand + IndexedDB), useAutoSave, ghost text Escape handler, CSS additions. ~730 tests pass.
- 2026-02-15T03:06:22Z: Phase 10 Desktop Packaging & Offline Mode — Rust bridge commands (rfd file dialogs, dirs model paths, reqwest streaming downloads), SetupScreen component (model catalog, download progress), offline/online transitions (AbortController cancellation, retry), 39 new tests. 770 tests pass (686 TS + 84 Rust).
- 2026-02-15T03:41:01Z: Phase 11 E2E Testing, Evals & Performance — 21 Playwright E2E specs (editing, AI UI, offline/online, performance), Tier 2 deterministic local judge (heuristic scoring), Tier 3 cloud judge (Claude API + MSW-mocked tests), vitest config, Chromium-only playwright config. 784 tests pass (700 TS + 84 Rust). 32 eval tests (12 compare + 6 T1 + 8 T2 + 6 T3).
- 2026-02-15T05:11:18Z: Frontend Plan Phase 1+2 — Document switcher sidebar, editable title, export menu, status bar, schema migration v1→v2 (tags/pinned/deletedAt/wordCount), search, tag filter, sort controls, soft delete/trash, pin. 16 new files + 6 modified. 869 tests pass (785 TS + 84 Rust). Web tests: 97 → 182 (85 new across 4 test files).
- 2026-02-15T06:42:47Z: Sidebar polish & document store bug fixes — Dark theme sidebar (black background, visible borders, hover highlights), React 19 useRef fix in SearchBar. Fixed 3 document store bugs: newDocument now async with immediate IDB persistence (appears in sidebar instantly), softDelete clears editor content (prevents auto-save recreating deleted doc), clicking active doc skips reload (preserves unsaved edits), switching docs saves current first. All 182 web tests pass.
