---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-15T05:11:18Z
version: 2.3
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

- **Phase**: Frontend Plan Phase 1+2 complete (document switcher, organization layer)
- **Files**: ~226 source files + 59 test files with real assertions
- **Tests**: 869 tests passing (785 TS + 84 Rust) + 21 E2E Playwright specs
  - `@inkwell/shared`: 15 | `@inkwell/editor`: 190 | `@inkwell/document-ai`: 303
  - `@inkwell/web`: 182 | `@inkwell/mcp-workspace`: 63 | `@inkwell/evals`: 32 | Rust: 84
- **Implementations**: Schema, router (+ network awareness, offline fallback), AI undo (3-phase commit + closeHistory), ghost text (+ TTFT instrumentation), collaboration, origin filter, transaction utilities, queue manager (+ debouncer, DocumentAIQueue), context manager (+ async workspace retrieval), reconciler (+ typed ReconcileResult, overlap detection, stale-deleted detection, schema-aware validation), diff preview (inline + floating toolbar), Claude streaming client (+ prompt caching), SSE parser, token counter (+ real API), response parser, prompt templates (5 operations incl. VoiceRefine), DocumentAIServiceImpl orchestration (+ workspace snippets in Claude requests), SlashCommands extension, web app Editor + hooks + Toolbar + BackpressureIndicator + SetupScreen, MCP server (4 tools), document chunker, vector store (+ content storage), file watcher, WorkspaceIndexer (implements WorkspaceRetriever), simpleEmbed (extracted to shared module), protocol adapter, 3-tier eval system (structural + deterministic local judge + cloud Claude judge), document persistence (Zustand + IndexedDB v2 with schema migration), auto-save, voice pipeline (FSM + audio capture + hook + component + Tauri bridge), local inference engines (llama/whisper), bridge validators, desktop packaging (file dialogs + model management + offline transitions), sidebar document switcher (search, tags, pin, sort, trash), editable document title, export menu, status bar
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
