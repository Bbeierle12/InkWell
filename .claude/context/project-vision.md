---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-14T21:14:34Z
version: 1.1
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
- 57 Rust tests passing

### Phase 5: MCP & Workspace Intelligence [COMPLETE]
- Build MCP workspace server (4 tools)
- Implement document indexing and vector search
- Create style guide extraction
- Enable cross-document context for AI operations
- 55 MCP workspace tests passing

### Phase 6: Polish & Quality (Current)
- Pass all 14 system invariants
- Achieve eval targets across all 3 tiers (Tier 1 done, Tier 2/3 pending)
- E2E test coverage for critical flows (Playwright — pending)
- Performance optimization (TTFT targets, input latency)

## Future Expansions

- **Multi-language support**: Writing assistance in non-English languages
- **Plugin system**: Third-party extensions for specialized writing domains
- **Team workspaces**: Shared style guides and document libraries
- **Version history**: AI-aware diff and timeline visualization
- **Export formats**: PDF, DOCX, Markdown, LaTeX export
- **Template system**: Document templates with AI-powered sections

## Guiding Principles

1. **Privacy first**: Users control where their data goes
2. **Speed matters**: Local inference for latency-sensitive operations
3. **Quality over quantity**: Fewer, better AI suggestions
4. **Writer's voice preserved**: AI adapts to the writer, not vice versa
5. **Transparent AI**: Users always know when AI is involved
6. **Offline capable**: Full functionality without internet (via desktop app)
