# Inkwell Architecture

## Overview

Inkwell is a hybrid local/cloud AI word processor built on:

- **TipTap (ProseMirror)** — Rich text editor core
- **Next.js** — Web application framework
- **Tauri** — Desktop shell with native capabilities
- **Claude API** — Cloud AI inference
- **llama.cpp / whisper.cpp** — Local AI inference

## System Diagram

```
┌─────────────────────────────────────────────┐
│                   Apps                       │
│  ┌──────────┐  ┌──────────────────────────┐ │
│  │  Web      │  │  Desktop (Tauri)         │ │
│  │  Next.js  │  │  Rust + llama/whisper    │ │
│  └────┬─────┘  └────┬─────────────────────┘ │
│       │              │                       │
├───────┴──────────────┴───────────────────────┤
│                 Packages                      │
│  ┌──────────┐  ┌────────────┐  ┌──────────┐ │
│  │  Editor   │  │ DocumentAI │  │   MCP    │ │
│  │  TipTap   │  │  Runtime   │  │ Workspace│ │
│  └──────────┘  └────────────┘  └──────────┘ │
│  ┌──────────────────────────────────────────┐│
│  │              Shared Types                 ││
│  └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

## Key Packages

### @inkwell/editor
TipTap editor core with custom extensions:
- **Ghost Text** — AI inline suggestions as decorations
- **Slash Commands** — "/" trigger for AI operations
- **Diff Preview** — Before/after rendering for rewrites
- **AI Undo** — Atomic undo for multi-step AI edits
- **Collaboration** — Y.js real-time editing

### @inkwell/document-ai
The AI brain:
- **Router** — Routes operations to local or cloud models
- **Queue** — Priority queue with cancellation and budgets
- **Context** — Assembles prompt context with caching
- **Reconciler** — Converts AI output to editor transactions
- **Claude Client** — Streaming API client

### @inkwell/mcp-workspace
MCP context server:
- Workspace file indexing and search
- Document analysis tools
- Style guide extraction

### @inkwell/shared
Shared types, constants, and utilities.

## Data Flow

1. User types in editor
2. Debounced trigger fires after 500ms idle
3. DocumentAI router selects model (local vs cloud)
4. Context manager assembles prompt with cached prefix
5. Request enters priority queue
6. Model generates response (streamed)
7. Reconciler maps output to ProseMirror transactions
8. Ghost text or diff preview renders result
9. User accepts or dismisses

## Invariants

See [INVARIANTS.md](./INVARIANTS.md) for the 14 tracked system invariants.
