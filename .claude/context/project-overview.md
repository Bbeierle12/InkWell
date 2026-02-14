---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-14T18:48:33Z
version: 1.5
author: Claude Code PM System
---

# Project Overview: Inkwell

## Summary

Inkwell is a hybrid local/cloud AI word processor built as a pnpm monorepo. It combines TipTap (ProseMirror) for rich text editing, Next.js for the web app, Tauri for the desktop app, and Claude API + llama.cpp for AI inference.

## Workspace Structure

```
inkwell/
  apps/
    web/          — Next.js 15 web app (static export)
    desktop/      — Tauri desktop shell (Rust + llama.cpp + whisper.cpp)
  packages/
    shared/       — Types, constants, utilities
    editor/       — TipTap editor core + extensions
    document-ai/  — AI runtime (routing, queue, context, reconciler, Claude client)
    mcp-workspace/ — MCP context server (indexing, search, analysis)
  evals/          — 3-tier AI evaluation system
  e2e/            — Playwright E2E tests
  fixtures/       — VCR fixtures for Claude API + audio test files
  docs/           — Architecture, test plan, invariants, prompts
```

## Current State

- **Phase**: Implementation Phase 3 complete (DocumentAI Runtime Core)
- **Files**: ~175 source files + 34 test files with real assertions
- **Tests**: 560 tests passing (503 TS + 57 Rust)
  - `@inkwell/shared`: 15 | `@inkwell/editor`: 186 | `@inkwell/document-ai`: 231
  - `@inkwell/mcp-workspace`: 55 | `@inkwell/evals`: 16 | Rust: 57
- **Implementations**: Schema, router (+ network awareness, offline fallback), AI undo (3-phase commit + closeHistory), ghost text (+ TTFT instrumentation), collaboration, origin filter, transaction utilities, queue manager (+ debouncer, DocumentAIQueue), context manager, reconciler, Claude streaming client, SSE parser, token counter, MCP server (4 tools), document chunker, vector store, file watcher, protocol adapter, eval comparison metrics, voice pipeline FSM, local inference engines (llama/whisper), bridge validators
- **Typecheck**: Clean for shared, mcp-workspace, evals packages
- **Dependencies**: 463+ npm packages installed (+ zod v4 for MCP)

## Integration Points

- **Claude API**: Streaming SSE for cloud AI operations
- **llama.cpp**: Local LLM via Rust FFI (Tauri desktop)
- **whisper.cpp**: Local speech-to-text via Rust FFI
- **Y.js**: CRDT-based real-time collaboration
- **MCP Protocol**: Model Context Protocol for workspace awareness
- **SQLite + sqlite-vec**: Vector search for document indexing

## CI/CD Pipelines

| Pipeline | Trigger | Tasks |
|----------|---------|-------|
| PR Gate | Pull request | Lint, typecheck, unit, integration |
| Merge Main | Push to main | Full suite + tier-3 eval |
| Nightly | Cron 3AM UTC | E2E, fuzz, Playwright report |
| Weekly | Cron Sunday 4AM | Long fuzz, stress tests |
