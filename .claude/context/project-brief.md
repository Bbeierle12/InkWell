---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-15T00:16:36Z
version: 1.2
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
2. 675 tests passing (597 TS + 78 Rust) with real assertions
3. 14 system invariants are tracked and tested
4. 3-tier eval system validates AI output quality (Tier 1 implemented)
5. Web and desktop (Tauri) apps share the same editor core
6. Privacy canary prevents private document leakage

## Target Platforms

- **Web**: Next.js with static export
- **Desktop**: Tauri (Rust shell) with native llama.cpp and whisper.cpp inference

## Current Phase

Implementation Phases 1-5 + Phase 7 (Voice Pipeline) complete. All core packages have real implementations and passing tests. Voice pipeline fully implemented with audio capture, local transcription, Claude refinement, and editor insertion. Ready for E2E testing, performance benchmarks, and Tier 2/3 eval implementation.
