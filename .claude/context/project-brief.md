---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-15T05:11:18Z
version: 1.3
author: Claude Code PM System
---

# Project Brief: Inkwell

## What It Does

Inkwell is an AI-powered word processor that integrates Claude AI deeply into the writing experience. It provides real-time inline suggestions (ghost text), slash-command-driven AI operations (rewrite, summarize, expand, critique), voice-to-text input, and collaborative editing — all within a rich text editor.

## Why It Exists

Current AI writing tools bolt AI onto existing editors as an afterthought. Inkwell is designed from the ground up with AI as a first-class citizen in the editing workflow. The editor schema, undo system, and rendering pipeline are all AI-aware, enabling seamless integration that feels native rather than external.

## Key Differentiators

- **Hybrid local/cloud AI**: Local llama.cpp for fast inline suggestions, Claude API for complex operations
- **Privacy-first**: Documents can be marked private and will never leave the local machine (enforced by privacy canary)
- **Atomic AI undo**: Multi-step AI edits collapse to a single undo step
- **Ghost text as decorations**: AI suggestions never pollute the document model
- **Prompt caching**: Stable prefix caching reduces latency and cost for repeated operations

## Success Criteria

1. Typecheck passes across all packages
2. 869 tests passing (785 TS + 84 Rust) with real assertions
3. 14 system invariants are tracked and tested
4. 3-tier eval system validates AI output quality (all tiers implemented)
5. Web and desktop (Tauri) apps share the same editor core
6. Privacy canary prevents private document leakage
7. Document management UI: sidebar, search, tags, pin, sort, trash

## Target Platforms

- **Web**: Next.js with static export
- **Desktop**: Tauri (Rust shell) with native llama.cpp and whisper.cpp inference

## Current Phase

All implementation phases (1-11) complete plus Frontend Plan Phase 1+2. Core packages fully implemented with 869 passing tests. Frontend now has document management sidebar with search, tags, pin, sort, and soft delete/trash. Next: Frontend Plan Phase 3 (MCP integration, analytics, collaboration UI).
