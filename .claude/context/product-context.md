---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-15T05:11:18Z
version: 1.3
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

### 2. Slash Commands [IMPLEMENTED]
- `/rewrite` — Restyle selected text (with target tone arg, e.g., `/rewrite formal`)
- `/summarize` — Condense to key points
- `/expand` — Add detail and elaboration
- `/critique` — Deep analysis with suggestions
- ProseMirror plugin with floating command palette, keyboard navigation, filtered search

### 3. Voice Input [IMPLEMENTED]
- whisper.cpp local transcription via `transcribe_audio_bytes` Rust command (accepts `Vec<f32>` directly)
- Audio capture utility: 16kHz mono PCM via getUserMedia + ScriptProcessorNode with resampling
- Voice Refine operation cleans up transcription (Claude Sonnet, plain text output)
- Full pipeline hook: record → transcribe → refine → insert at cursor
- Offline fallback: raw transcript inserted if Claude unavailable
- State-driven VoiceInput component with timer, ARIA labels, cancel at any stage
- Desktop-only (requires Tauri environment)

### 4. Diff Preview [IMPLEMENTED]
- Shows before/after for AI rewrites (inline red strikethrough / green underline)
- Accept/reject UI with floating toolbar
- Single-undo-step for accepted changes via AIOperationSession
- Full editor-to-AI-to-editor pipeline wired: Editor → useDocumentAI → DocumentAIServiceImpl → Claude API → response parser → diff preview

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

### 7. Document Management [IMPLEMENTED]
- Collapsible sidebar with document list (title, relative time, preview, word count)
- Click-to-edit inline title in toolbar (auto-derives from content headings/paragraphs)
- Tags system with colored chips, inline editor with autocomplete
- Pin/favorite documents (pinned always sort to top)
- Search across document titles and content previews
- Sort controls: Last Modified, Created, Title A-Z, Title Z-A
- Soft delete with trash view (restore or permanent delete)
- IndexedDB schema migration v1→v2 with read-time backfill

### 8. Export [IMPLEMENTED]
- Copy as Markdown (clipboard)
- Download as Markdown (.md file)
- Tauri-only: Save to File dialog, Open File dialog (native rfd dialogs)

### 9. Status Bar [IMPLEMENTED]
- Save status indicator (Unsaved/Saved with color)
- Live word count and character count (subscribes to editor updates)

## Privacy Model

- Documents can be marked private
- Private documents use local inference only
- Privacy canary (`CANARY_PRIVATE_DO_NOT_TRANSMIT`) is embedded in private docs
- MSW interceptor catches any attempt to transmit canary string
- Router enforces local-only routing for private documents
