---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-15T03:41:01Z
version: 2.1
author: Claude Code PM System
---

# Project Structure: Inkwell

## Monorepo Layout

```
inkwell/                          # Root (pnpm workspaces + turborepo)
├── package.json                  # Root scripts, shared devDeps
├── pnpm-workspace.yaml           # Workspace: packages/*, apps/*, evals, e2e
├── turbo.json                    # Pipeline: build, test, lint, typecheck, eval
├── .gitignore
├── .github/workflows/            # CI: pr-gate, merge-main, nightly, weekly
│
├── packages/
│   ├── shared/                   # @inkwell/shared (15 tests)
│   │   └── src/
│   │       ├── types.ts          # OperationType, ModelTarget, RoutingMode, ReconcileResult, MCP types, Voice enums
│   │       ├── constants.ts      # PRIVACY_CANARY, TOKEN_BUDGETS, thresholds, INVARIANT_IDS
│   │       ├── voice-pipeline.ts # FSM transition table + transition() [IMPLEMENTED]
│   │       ├── utils/
│   │       │   ├── levenshtein.ts  # Edit distance + ratio
│   │       │   └── hash.ts        # SHA-256 content hashing
│   │       ├── __tests__/        # voice-pipeline.test.ts (10), utils.test.ts (5)
│   │       └── index.ts          # Barrel exports
│   │
│   ├── editor/                   # @inkwell/editor (190 tests)
│   │   └── src/
│   │       ├── schema/           # ProseMirror nodes + marks [IMPLEMENTED]
│   │       │   └── __tests__/    # schema.test.ts (121), schema.property.test.ts (15)
│   │       ├── extensions/
│   │       │   ├── ghost-text/   # AI inline suggestion decorations + TTFT [IMPLEMENTED]
│   │       │   │   └── __tests__/ # ghost-text.test.ts (11)
│   │       │   ├── ai-undo/     # Atomic undo with closeHistory [IMPLEMENTED]
│   │       │   │   └── __tests__/ # ai-undo.test.ts (9)
│   │       │   ├── slash-commands/ # "/" command palette [IMPLEMENTED]
│   │       │   │   └── __tests__/ # slash-commands.test.ts (4)
│   │       │   └── diff-preview/  # Inline diff with floating toolbar [IMPLEMENTED]
│   │       │       └── __tests__/ # diff-preview.test.ts (8)
│   │       ├── collaboration/    # Y.js + origin filtering [IMPLEMENTED]
│   │       │   └── __tests__/    # origin-filter.test.ts (6), yjs-conflicts.test.ts (4)
│   │       └── transactions/     # Utilities + integrity verification [IMPLEMENTED]
│   │           ├── index.ts      # clampPosition, safeInsertText, safeDelete, etc.
│   │           └── __tests__/    # integrity.test.ts (9), integrity.property.test.ts (3)
│   │
│   ├── document-ai/             # @inkwell/document-ai (303 tests)
│   │   └── src/
│   │       ├── router/          # Model routing with network awareness [IMPLEMENTED]
│   │       │   ├── index.ts     # ModelRouter: setOnline/isOnline, CloudUnavailableError
│   │       │   ├── types.ts     # RoutingResult, CloudUnavailableError
│   │       │   └── __tests__/   # router.test.ts (40), canary.test.ts (10)
│   │       ├── queue/           # Priority queue, debounce, budget, backpressure [IMPLEMENTED]
│   │       │   ├── index.ts     # QueueManager (priority, dedup, cancel)
│   │       │   ├── debouncer.ts         # Configurable debounce with rapid-fire collapsing
│   │       │   ├── document-ai-queue.ts # Integrated orchestration layer
│   │       │   ├── token-budget.ts      # Sliding-window per-minute enforcement
│   │       │   ├── backpressure.ts      # Pause/resume state machine
│   │       │   └── __tests__/   # queue.test.ts (40), debouncer.test.ts (14), document-ai-queue.test.ts (20)
│   │       ├── context/         # Prompt assembly, prefix cache, sliding window [IMPLEMENTED]
│   │       │   └── __tests__/   # context.test.ts (47)
│   │       ├── reconciler/      # AI output → ProseMirror transactions [IMPLEMENTED + ENHANCED]
│   │       │   ├── overlap-detector.ts  # Sweep-line overlap detection
│   │       │   └── __tests__/   # reconciler.test.ts (64), reconciler.property.test.ts (10)
│   │       ├── prompts/         # Prompt templates per operation [IMPLEMENTED]
│   │       │   ├── index.ts     # getPromptTemplate(), renderPrompt()
│   │       │   ├── rewrite.ts   # Rewrite system/user prompts
│   │       │   ├── summarize.ts # Summarize prompts
│   │       │   ├── expand.ts    # Expand prompts
│   │       │   ├── critique.ts  # Critique prompts (non-editing output)
│   │       │   ├── voice-refine.ts # Voice transcription cleanup (plain text output)
│   │       │   └── __tests__/   # prompts.test.ts (9)
│   │       ├── claude/          # Streaming client, SSE parser, token counter, response parser [IMPLEMENTED]
│   │       │   ├── client.ts    # ClaudeClient.stream() with system + cache_control
│   │       │   ├── response-parser.ts  # parseAIResponse(), collectAndParse()
│   │       │   ├── token-counter.ts    # estimateTokens() + countTokens() (API with fallback)
│   │       │   └── __tests__/   # contract.test.ts (6), stream-errors.test.ts (8), stop-reason.test.ts (3), response-parser.test.ts (6), token-counter.test.ts (4)
│   │       ├── service.ts       # DocumentAIServiceImpl orchestration [IMPLEMENTED] (+ VoiceRefine + workspace snippets)
│   │       ├── __tests__/       # service.test.ts (5), voice-refine.test.ts (4), workspace-integration.test.ts (7)
│   │       ├── test-setup.ts    # MSW server + privacy canary interceptor
│   │       └── types.ts         # DocumentAIService interface (async buildContext)
│   │
│   └── mcp-workspace/           # @inkwell/mcp-workspace (63 tests)
│       └── src/
│           ├── server.ts         # MCP server factory (McpServer + 4 tools) [IMPLEMENTED]
│           ├── tools/            # 4 MCP tools [IMPLEMENTED]
│           │   ├── workspace-search.ts    # Vector search (imports simpleEmbed from indexer/embed)
│           │   ├── workspace-watch.ts     # FileWatcher delegation
│           │   ├── document-analyze.ts    # Text structure analysis
│           │   ├── document-style-guide.ts # Style heuristics
│           │   └── __tests__/tools.test.ts (10)
│           ├── indexer/          # [IMPLEMENTED]
│           │   ├── chunker.ts             # Sliding window chunking
│           │   ├── vector-store.ts        # SQLite + sqlite-vec (graceful fallback, content storage)
│           │   ├── file-watcher.ts        # Injectable fs module
│           │   ├── embed.ts               # simpleEmbed() — 384-dim bag-of-words hash (Decision 8-1)
│           │   ├── workspace-indexer.ts   # WorkspaceIndexer: FileWatcher + chunker + embed + VectorStore
│           │   └── __tests__/   # chunker (8), vector-store (9), file-watcher (6), indexer (4), retrieval (3)
│           ├── protocol/         # [IMPLEMENTED]
│           │   ├── adapter.ts             # MCP version + JSON-RPC validation
│           │   └── __tests__/   # adapter (6), compliance (4)
│           ├── __tests__/server.test.ts (5), workspace-indexer.test.ts (8)
│           └── index.ts          # Expanded barrel exports (+ WorkspaceIndexer, simpleEmbed)
│
├── apps/
│   ├── web/                     # @inkwell/web (97 tests)
│   │   └── src/
│   │       ├── app/             # App Router (layout, page, globals.css)
│   │       ├── components/      # Editor, Toolbar, DiffPreview, Backpressure, VoiceInput
│   │       ├── hooks/           # useDocumentAI, useGhostText, useVoicePipeline [IMPLEMENTED]
│   │       │   └── __tests__/   # useVoicePipeline.test.ts (8)
│   │       └── lib/             # document-ai-instance, tauri-bridge, audio-capture
│   │           └── __tests__/   # audio-capture.test.ts (5), tauri-bridge-voice.test.ts (2)
│   │
│   └── desktop/                 # @inkwell/desktop (Tauri)
│       ├── src-tauri/
│       │   ├── build.rs         # tauri_build::build()
│       │   ├── Cargo.toml       # Features: local-llm, local-stt, local-inference
│       │   ├── icons/icon.ico   # Windows application icon
│       │   ├── src/
│       │   │   ├── main.rs      # Binary entry
│       │   │   ├── lib.rs       # Tauri setup + command registration (granular cfg gates)
│       │   │   ├── inference/   # LlamaEngine, WhisperEngine, RealLlmBackend, RealSttBackend
│       │   │   ├── bridge/      # Tauri invoke commands
│       │   │   └── tests/       # Integration test stubs
│       │   └── benches/         # Criterion benchmarks
│       └── tauri.conf.json      # frontendDist: ../../web/out
│
├── evals/                       # @inkwell/evals (32 tests)
│   ├── vitest.config.ts         # Vitest config (globals, 15s timeout)
│   └── src/
│       ├── compare.ts           # Similarity scoring (exactMatch, cosine, BLEU-4, ROUGE-L) [IMPLEMENTED]
│       ├── compare.test.ts      # 12 tests
│       ├── tier1/               # Structural checks [IMPLEMENTED] — structural.test.ts (6)
│       ├── tier2/               # Deterministic local judge [IMPLEMENTED]
│       │   ├── local-judge.ts   # Heuristic scoring using compare() + operation-specific scorers
│       │   ├── local-judge.test.ts # 8 tests
│       │   └── fixtures/judge-prompts.json  # Criteria per operation (4 criteria each)
│       ├── tier3/               # Cloud judge (Claude-as-Judge) [IMPLEMENTED]
│       │   ├── cloud-judge.ts   # Claude API integration with JSON extraction
│       │   ├── cloud-judge.test.ts # 6 tests (MSW-mocked)
│       │   ├── test-setup.ts    # MSW server setup for Claude API
│       │   └── fixtures/judge-prompts.json  # Criteria per operation (5 criteria each)
│       └── golden/              # Reference outputs (rewrite, summarize, expand, critique)
│
├── e2e/                         # @inkwell/e2e (Playwright — 21 specs)
│   ├── playwright.config.ts     # Chromium-only, 30s webServer timeout
│   └── tests/
│       ├── editing-flows.spec.ts   # 8 tests: load, type, bold, italic, undo/redo, headings, lists, copy/paste
│       ├── ai-flows.spec.ts        # 5 tests: slash palette, navigation, filtering, AI dropdown, mode indicator
│       ├── offline-online.spec.ts  # 4 tests: online default, go offline, recover, edit while offline
│       └── performance.spec.ts     # 4 tests: load time, typing speed, large doc, scroll stability
│
├── fixtures/
│   ├── claude/                  # VCR fixtures: success, errors, streaming edge cases
│   └── audio/                   # WAV placeholders for whisper tests
│
└── docs/                        # ARCHITECTURE, TEST-PLAN, INVARIANTS, PROMPTS, DECISIONS
```

## File Naming Conventions

- Source: `kebab-case.ts` (e.g., `ghost-text/index.ts`, `stream-handler.ts`)
- Tests: `__tests__/name.test.ts` or `__tests__/name.property.test.ts`
- React components: `PascalCase.tsx` (e.g., `Editor.tsx`, `Toolbar.tsx`)
- Rust: `snake_case.rs` (e.g., `inference_tests.rs`, `bridge_bench.rs`)
- Config: dot-prefixed or standard names (`vitest.config.ts`, `tsconfig.json`)

## Module Organization

- Each package has a barrel export (`src/index.ts`)
- Tests co-located in `__tests__/` directories alongside source
- Property-based tests suffixed `.property.test.ts`
- Fixtures separated from source in top-level `fixtures/` directory
