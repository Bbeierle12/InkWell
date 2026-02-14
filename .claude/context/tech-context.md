---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-14T00:11:35Z
version: 1.0
author: Claude Code PM System
---

# Tech Context: Inkwell

## Core Technologies

| Technology | Version | Purpose |
|-----------|---------|---------|
| TypeScript | ^5.7.3 | Primary language |
| Rust | (Tauri crate) | Desktop native layer |
| pnpm | 9.15.4 | Package manager (workspaces) |
| Turborepo | ^2.3.3 | Monorepo build orchestration |

## Frontend Stack

| Technology | Version | Package |
|-----------|---------|---------|
| Next.js | ^15.1.3 | `@inkwell/web` |
| React | ^19.0.0 | UI framework |
| Tailwind CSS | ^4.0.0 | Styling |
| TipTap | ^2.11.2 | Rich text editor (ProseMirror wrapper) |
| Y.js | ^13.6.20 | Real-time CRDT collaboration |
| y-prosemirror | ^1.2.12 | Y.js ↔ ProseMirror binding |
| y-indexeddb | ^9.0.12 | Offline persistence |
| Zustand | ^5.0.2 | Client state management |

## AI / Inference

| Technology | Purpose |
|-----------|---------|
| Claude API (Sonnet/Opus) | Cloud AI operations |
| llama.cpp | Local LLM inference (via Rust FFI) |
| whisper.cpp | Local speech-to-text (via Rust FFI) |
| eventsource-parser | ^3.0.0 — SSE stream parsing |

## Desktop

| Technology | Purpose |
|-----------|---------|
| Tauri | Desktop shell (Rust ↔ JS bridge) |
| serde / serde_json | Rust serialization |
| tokio | Async runtime |
| criterion | Benchmarks |

## Data / Search

| Technology | Version | Purpose |
|-----------|---------|---------|
| better-sqlite3 | ^11.7.0 | SQLite database |
| sqlite-vec | ^0.1.6 | Vector search extension |
| @modelcontextprotocol/sdk | ^1.4.0 | MCP protocol |

## Testing

| Tool | Version | Purpose |
|------|---------|---------|
| Vitest | ^2.1.8 | Unit tests + fuzz tests |
| @vitest/coverage-v8 | ^2.1.8 | Code coverage |
| fast-check | ^3.23.2 | Property-based testing |
| MSW | ^2.7.0 | API mocking (VCR fixtures) |
| Playwright | ^1.49.1 | E2E testing |
| jsdom | ^28.0.0 | DOM environment for editor tests |
| prosemirror-test-builder | ^1.1.1 | ProseMirror test utilities |

## Dev Tooling

| Tool | Version | Purpose |
|------|---------|---------|
| ESLint | ^9.17.0 | Linting |
| @typescript-eslint | ^8.18.2 | TS-specific lint rules |
| Prettier | ^3.4.2 | Code formatting |

## Module Resolution

- All packages use `moduleResolution: "bundler"` in tsconfig
- Workspace dependencies linked via `workspace:*` protocol
- No TypeScript project references (removed for `tsc --noEmit` compatibility)
- Packages export source directly (`main: "./src/index.ts"`)

## Build Strategy

- No pre-build step for packages (source-level imports)
- Next.js static export (`output: 'export'`) for Tauri embedding
- Tauri builds are separate from JS pipeline
- Turborepo caches typecheck and lint; tests/evals always uncached
