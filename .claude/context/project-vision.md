---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-15T05:11:18Z
version: 1.3
author: Claude Code PM System
---

# Project Vision: Inkwell

## Long-Term Vision

Inkwell aims to be the definitive AI-native word processor — an editor where AI is not an add-on but a fundamental part of the writing experience. The long-term goal is a tool that adapts to each writer's voice, learns from their style, and provides contextually aware assistance across their entire document corpus.

## Strategic Priorities

### Phase 1: Foundation [COMPLETE]
- Scaffold complete monorepo with all packages
- Establish schema, invariants, and testing patterns
- Create placeholder implementations for all components
- Set up CI/CD pipelines

### Phase 2: Core Editor [COMPLETE]
- Implement ProseMirror schema with full node/mark support (136 tests)
- Wire up TipTap extensions (ghost text, slash commands, diff preview, AI undo)
- Implement Y.js collaboration with origin filtering
- 190 editor tests passing

### Phase 3: AI Runtime [COMPLETE]
- Implement Claude API streaming client with error handling
- Build model router with local/cloud routing logic
- Implement priority queue with token budgets and backpressure
- Build reconciler for AI output → editor transaction conversion
- Implement prompt caching strategy
- 285 document-ai tests passing

### Phase 4: Desktop Integration [COMPLETE]
- Build Tauri shell with Rust ↔ JS bridge
- Integrate llama.cpp for local inference
- Integrate whisper.cpp for voice-to-text
- 78 Rust tests passing

### Phase 5: MCP & Workspace Intelligence [COMPLETE]
- Build MCP workspace server (4 tools)
- Implement document indexing and vector search
- Create style guide extraction
- Enable cross-document context for AI operations
- 55 MCP workspace tests passing

### Phase 7: Voice Pipeline [COMPLETE]
- VoiceRefine prompt template (plain text output, not JSON)
- DocumentAI service VoiceRefine path with raw text collection
- Tauri `transcribe_audio_bytes` command (Vec<f32> PCM, no temp files)
- Audio capture utility (16kHz mono, ScriptProcessorNode, resampling)
- Full useVoicePipeline hook (FSM orchestrator, AbortController, offline fallback)
- VoiceInput component (state-driven UI, ARIA, recording timer)
- 27 new tests across 4 test files

### Phase 6: Polish & Quality [COMPLETE]
- 14 system invariants tracked and tested
- 3-tier eval system (structural + local judge + cloud judge) — 32 eval tests
- 21 Playwright E2E specs (editing, AI UI, offline/online, performance)
- 869 tests passing (785 TS + 84 Rust)

### Frontend Plan Phase 1+2: Document Management [COMPLETE]
- Collapsible sidebar with document list, editable title, export menu, status bar
- Schema migration v1→v2 with tags, pinned, deletedAt, wordCount fields
- Search, tag filter, sort controls, soft delete/trash, pin/favorite
- 85 new tests (33 store-v2 + 20 sidebar + 21 schema + 11 filtered docs)

### Frontend Plan Phase 3: Advanced Features (Next)
- MCP workspace integration UI
- Analytics dashboard
- Collaboration UI
- Vector search UI

## Future Expansions

- **Multi-language support**: Writing assistance in non-English languages
- **Plugin system**: Third-party extensions for specialized writing domains
- **Team workspaces**: Shared style guides and document libraries
- **Version history**: AI-aware diff and timeline visualization
- **Export formats**: PDF, DOCX, LaTeX export (Markdown already implemented)
- **Template system**: Document templates with AI-powered sections

## Guiding Principles

1. **Privacy first**: Users control where their data goes
2. **Speed matters**: Local inference for latency-sensitive operations
3. **Quality over quantity**: Fewer, better AI suggestions
4. **Writer's voice preserved**: AI adapts to the writer, not vice versa
5. **Transparent AI**: Users always know when AI is involved
6. **Offline capable**: Full functionality without internet (via desktop app)
