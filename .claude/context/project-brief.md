---
created: 2026-02-14T00:11:35Z
last_updated: 2026-02-14T00:11:35Z
version: 1.0
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
2. 94+ unit tests pass with TODO bodies (scaffolding phase)
3. 14 system invariants are tracked and tested
4. 3-tier eval system validates AI output quality
5. Web and desktop (Tauri) apps share the same editor core
6. Privacy canary prevents private document leakage

## Target Platforms

- **Web**: Next.js with static export
- **Desktop**: Tauri (Rust shell) with native llama.cpp and whisper.cpp inference

## Current Phase

Scaffolding complete. All packages are structured with placeholder implementations (`throw "not implemented"`) and test skeletons (`// TODO: implement`). Ready for implementation.
