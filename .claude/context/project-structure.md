---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-14T02:25:16Z
version: 1.2
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
│   ├── shared/                   # @inkwell/shared
│   │   └── src/
│   │       ├── types.ts          # OperationType, ModelTarget, RoutingMode, interfaces
│   │       ├── constants.ts      # PRIVACY_CANARY, TOKEN_BUDGETS, thresholds, INVARIANT_IDS
│   │       ├── utils/
│   │       │   ├── levenshtein.ts  # Edit distance + ratio
│   │       │   └── hash.ts        # SHA-256 content hashing
│   │       └── index.ts          # Barrel exports
│   │
│   ├── editor/                   # @inkwell/editor (181 tests)
│   │   └── src/
│   │       ├── schema/           # ProseMirror nodes + marks [IMPLEMENTED]
│   │       │   └── __tests__/    # schema.test.ts (121), schema.property.test.ts (15)
│   │       ├── extensions/
│   │       │   ├── ghost-text/   # AI inline suggestion decorations [IMPLEMENTED]
│   │       │   │   └── __tests__/ # ghost-text.test.ts (9)
│   │       │   ├── ai-undo/     # Atomic undo for AI operations [IMPLEMENTED]
│   │       │   │   └── __tests__/ # ai-undo.test.ts (7)
│   │       │   ├── slash-commands/ # "/" command palette
│   │       │   └── diff-preview/  # Before/after rendering
│   │       ├── collaboration/    # Y.js + origin filtering [IMPLEMENTED]
│   │       │   └── __tests__/    # origin-filter.test.ts (6), yjs-conflicts.test.ts (4)
│   │       └── transactions/     # Integrity verification
│   │           └── __tests__/    # integrity.test.ts (8), integrity.property.test.ts (3)
│   │
│   ├── document-ai/             # @inkwell/document-ai (180 tests)
│   │   └── src/
│   │       ├── router/          # Model routing (local/Sonnet/Opus) [IMPLEMENTED]
│   │       │   └── __tests__/   # router.test.ts (23), canary.test.ts (10)
│   │       ├── queue/           # Priority queue, token budget, backpressure [IMPLEMENTED]
│   │       │   └── __tests__/   # queue.test.ts (40)
│   │       ├── context/         # Prompt assembly, prefix cache, sliding window [IMPLEMENTED]
│   │       │   └── __tests__/   # context.test.ts (47)
│   │       ├── reconciler/      # AI output → ProseMirror transactions [IMPLEMENTED]
│   │       │   └── __tests__/   # reconciler.test.ts (38), reconciler.property.test.ts (7)
│   │       ├── claude/          # Streaming client, SSE parser, token counter [IMPLEMENTED]
│   │       │   └── __tests__/   # contract.test.ts (4), stream-errors.test.ts (8), stop-reason.test.ts (3)
│   │       ├── test-setup.ts    # MSW server + privacy canary interceptor
│   │       └── types.ts         # DocumentAIService interface
│   │
│   └── mcp-workspace/           # @inkwell/mcp-workspace
│       └── src/
│           ├── server.ts         # MCP server factory
│           ├── tools/            # 4 MCP tools (search, watch, analyze, style-guide)
│           ├── indexer/          # File watcher, chunker, vector store
│           └── protocol/         # MCP adapter
│
├── apps/
│   ├── web/                     # @inkwell/web (Next.js 15)
│   │   └── src/
│   │       ├── app/             # App Router (layout, page, globals.css)
│   │       ├── components/      # Editor, Toolbar, DiffPreview, Backpressure, Voice
│   │       ├── hooks/           # useDocumentAI, useGhostText, useVoicePipeline
│   │       └── lib/             # document-ai-instance singleton
│   │
│   └── desktop/                 # @inkwell/desktop (Tauri)
│       ├── src-tauri/
│       │   ├── src/
│       │   │   ├── main.rs      # Binary entry
│       │   │   ├── lib.rs       # Tauri setup + command registration
│       │   │   ├── inference/   # LlamaEngine, WhisperEngine
│       │   │   ├── bridge/      # Tauri invoke commands
│       │   │   └── tests/       # Integration test stubs
│       │   └── benches/         # Criterion benchmarks
│       └── tauri.conf.json
│
├── evals/                       # @inkwell/evals
│   └── src/
│       ├── tier1/               # Structural checks (regex, JSON validation)
│       ├── tier2/               # Local 8B judge
│       ├── tier3/               # Claude-as-judge
│       ├── golden/              # Reference outputs (rewrite, summarize, expand, critique)
│       └── compare.ts           # Similarity scoring
│
├── e2e/                         # @inkwell/e2e (Playwright)
│   └── tests/                   # editing-flows, ai-flows, offline-online, performance
│
├── fixtures/
│   ├── claude/                  # VCR fixtures: success, errors, streaming edge cases
│   └── audio/                   # WAV placeholders for whisper tests
│
└── docs/                        # ARCHITECTURE, TEST-PLAN, INVARIANTS, PROMPTS
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
