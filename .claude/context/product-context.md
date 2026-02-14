---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-14T00:11:35Z
version: 1.0
author: Claude Code PM System
---

# Product Context: Inkwell

## Target Users

### Primary: Professional Writers
- Authors, journalists, technical writers
- Need AI assistance that adapts to their writing style
- Value privacy for unpublished work

### Secondary: Knowledge Workers
- Researchers, analysts, consultants
- Need document summarization and critique
- Work across multiple documents with shared context

### Tertiary: Developers Writing Docs
- README authors, documentation maintainers
- Need code-aware writing assistance
- Value MCP workspace integration

## Core Features

### 1. Inline AI Suggestions (Ghost Text)
- Appears as dimmed text after cursor
- Triggered after 500ms idle (debounced)
- Uses local model for speed (< 200ms TTFT)
- Stability threshold prevents flicker (Levenshtein ratio)
- Never serialized into document

### 2. Slash Commands
- `/rewrite` — Restyle selected text
- `/summarize` — Condense to key points
- `/expand` — Add detail and elaboration
- `/critique` — Deep analysis with suggestions

### 3. Voice Input
- whisper.cpp local transcription
- Voice Refine operation cleans up transcription
- Works offline via desktop app

### 4. Diff Preview
- Shows before/after for AI rewrites
- Accept/reject UI
- Single-undo-step for accepted changes

### 5. Real-Time Collaboration
- Y.js CRDT-based sync
- Origin filtering prevents remote changes from triggering AI
- IndexedDB persistence

### 6. MCP Workspace Server
- Indexes workspace files for context
- Vector search (SQLite + sqlite-vec)
- Style guide extraction

## AI Operations

| Operation | Model | Token Budget | Use Case |
|-----------|-------|-------------|----------|
| Inline Suggest | Local (llama.cpp) | 4,000 | Auto-complete |
| Rewrite | Claude Sonnet | 16,000 | Style adjustment |
| Summarize | Claude Sonnet | 16,000 | Condensation |
| Expand | Claude Sonnet | 16,000 | Elaboration |
| Critique | Claude Opus | 32,000 | Deep analysis |
| Voice Refine | Claude Sonnet | 16,000 | Transcription cleanup |

## Privacy Model

- Documents can be marked private
- Private documents use local inference only
- Privacy canary (`CANARY_PRIVATE_DO_NOT_TRANSMIT`) is embedded in private docs
- MSW interceptor catches any attempt to transmit canary string
- Router enforces local-only routing for private documents
