# Grammar Check — Design

**Date:** 2026-07-13
**Status:** Approved, pending implementation plan

---

## 1. Problem

InkWell's Proofing ribbon ships three buttons — `Spell`, `Grammar`, `AI Proofread` — and **all three dispatch the same `OperationType.Proofread`** (`apps/web/src/components/Toolbar.tsx:701-731`). Three controls, one behavior. There is no real spelling or grammar checker; the only "check" is a selection-scoped LLM round-trip that renders through `DiffPreview`.

Separately, the editor's contenteditable runs with native browser spellcheck on by default (`apps/web/src/lib/settings-store.ts:128` → `apps/web/src/app/page.tsx:139,178`), so the only squigglies users currently see are Chrome's.

This design gives `Spell` and `Grammar` a real, local, deterministic engine, and leaves `AI Proofread` as the LLM path.

## 2. Goals / Non-goals

**Goals**
- Ambient inline spelling + grammar checking, as-you-type, offline, free.
- Make the three Proofing buttons mean three different things.
- Never corrupt the document. A wrong suggestion is bad; a mis-anchored *applied* correction is unacceptable.

**Non-goals (explicitly cut)**
- Any LLM involvement in the inline layer. Non-determinism means squigglies flicker between runs on text the user never touched — this violates the spirit of the existing `ghost-text-no-flicker` invariant.
- A new `OperationType`. See §4.
- Sidebar review pane, issue-category taxonomy beyond two, keyboard-navigable issue list. YAGNI for v1.

## 3. Engine

`harper.js@2.4.0` — WASM, local, no network. One engine for **both** apps (Next.js web + Tauri webview), so web and desktop cannot silently disagree.

`nspell` (Hunspell-compatible) is the fallback if Harper's rule quality disappoints, but it is spelling-only; grammar would have to be re-scoped.

**New package: `packages/grammar`**

Framework-agnostic. No React, no ProseMirror, no network. Exposes:

```ts
check(blockText: string): Promise<GrammarIssue[]>
```

```ts
interface GrammarIssue {
  id: string;              // String(await linter.contextHash(text, lint)) — see §5.5
  kind: 'spelling' | 'grammar';
  ruleKind: string;        // Harper's LintKind, e.g. 'Spelling' | 'Agreement'
  offset: number;          // char offset WITHIN blockText (Lint.span().start)
  length: number;          // span().end - span().start
  originalText: string;    // Lint.get_problem_text() — the anchor
  message: string;
  suggestions: string[];   // Suggestion.get_replacement_text()
}
```

**Harper API facts this design depends on** (verified against `harper.js@2.4.0` `dist/index.d.ts`):

- `Linter.lint(text, options)` is **async** — returns `Promise<Lint[]>`. `check()` is therefore async. It remains *deterministic and pure* with respect to its input, which is the property that matters versus an LLM.
- **`WorkerLinter` already spins up its own dedicated web worker.** We do **not** hand-build a Worker bridge. The app constructs `WorkerLinter`; Node-based tests construct `LocalLinter` (the type docs state `WorkerLinter` "will not work properly in Node"). Both implement the same `Linter` interface, so `packages/grammar` takes the `Linter` as a constructor dependency and is testable without a worker.
- **`LintOptions.language` defaults to `'markdown'`.** We pass `language: 'plaintext'`, since we hand it a single block's plain text. Failing to do this misparses the content.
- `Lint.span()` → `Span { start, end }`, **character indices into the passed text.** `Lint.get_problem_text()` returns the exact flagged substring — this is our anchor (§5.4).
- `Lint.lint_kind()` → a `LintKind` string. Mapping to our two categories:
  - `kind: 'spelling'` ⟵ `'Spelling' | 'Typo'`
  - `kind: 'grammar'` ⟵ everything else (`'Agreement'`, `'Capitalization'`, `'Punctuation'`, `'WordChoice'`, …)
- **`Lint` and `Suggestion` are WASM-backed** with `free()` / `[Symbol.dispose]()`. `check()` converts each `Lint` into the plain `GrammarIssue` object above **before returning**. A `Lint` must never be stored in ProseMirror plugin state.

**Native features we consume rather than build:**

| Need | Harper API |
|---|---|
| Personal dictionary | `importWords(string[])` / `exportWords()` |
| Ignore an issue | `ignoreLint(source, lint)` / `ignoreLintHash(bigint)` |
| Persist ignores | `exportIgnoredLints()` / `importIgnoredLints(json)` — privacy-respecting hashes |
| Stable issue identity | `contextHash(source, lint) → bigint` |

An earlier draft of this design hand-rolled the dictionary, the ignore list, and a content-derived ID. All three already exist upstream and are better. Do not reimplement them.

## 4. Integration boundary: the local engine does not touch `document-ai`

**No new `OperationType` is added.** This is deliberate, not laziness. Adding one breaks four `never`-exhaustiveness switches that fail typecheck (`packages/document-ai/src/router/index.ts:113-116` and `:163-166`, `getTokenBudget` in `service.ts:66-75`, `budgetCategory` in `queue/document-ai-queue.ts:22-33`) and requires a `templateMap` entry in `prompts/index.ts:22-29`, which *throws* for unmapped operations.

More importantly it would be wrong: the local engine has no prompt, no model target, no token budget, and no queue semantics. Routing it through the AI pipeline would be modelling a local pure function as a network operation.

Blast radius on `@inkwell/document-ai`: **zero.** `AI Proofread` continues to work exactly as it does today.

## 5. The correctness core

This is the load-bearing section. An earlier draft of this design had the LLM return `{offset, length}` character offsets against `doc.textContent` and consumed them as ProseMirror positions — the same conflation the app already contains (`apps/web/src/hooks/useDocumentAI.ts:93` sends flat text; `:162-181` consumes the response as PM positions). That approach can corrupt the document. It is abandoned.

### 5.1 Never flatten the document

The engine only ever sees **one block's text at a time**. Offsets therefore convert locally:

```
pmPos = blockStart + 1 + offset
```

This is a checkable, local mapping — not global arithmetic over a separator-less flattening of the whole doc.

**Known hazard:** inline non-text nodes (hard breaks, inline images) break the linearity of `offset → pmPos`. The conversion is implemented as an explicit text-node walk, not naive addition, and is covered by a `fast-check` property test (`fast-check` is already a devDependency of `packages/editor`).

### 5.2 Single source of truth

Plugin state holds `issues[]`. The `DecorationSet` is **derived** from `issues[]` on each apply. It is never mapped independently — two independently-mapped structures are guaranteed to drift.

### 5.3 One rule: map, then verify the text; drop on mismatch

On every `tr.docChanged`, each live issue is mapped through `tr.mapping` and then **immediately verified**:

```
doc.textBetween(from, to) === issue.originalText   // else: drop the issue
```

This single rule subsumes what an earlier draft split into two:

- **It invalidates instead of stretching.** Typing inside a flagged word makes the mapped range no longer equal `originalText`, so the issue is *dropped* — not grown into a squiggle that persists over corrected text.
- **It makes mis-anchoring structurally impossible.** An issue is only ever rendered over text that still literally equals what the engine flagged.

No changed-range intersection test is needed; the text comparison *is* the test.

**Accepted UX consequence:** a squiggle disappears the moment you edit its word and returns after the next scan. This is correct-by-construction and was explicitly approved.

### 5.4 Scan results are content-addressed, not position-addressed

The engine is handed exactly one block's `textContent` and returns offsets **relative to that string**. So results are keyed by the string itself, never by a document position:

- **Cache:** `Map<blockText, GrammarIssue[]>` (bounded LRU, 200 entries).
- **Dispatch:** on debounce, walk top-level blocks. Cache hit → anchor immediately. Miss → dispatch an async `check(blockText)`.
- **Landing:** on result, `cache.set(blockText, issues)`, then re-run the anchoring pass — anchoring the issues to **whichever blocks currently hold that exact text.** If no block still holds it, the result is simply unused.

A result that lands after the user has typed cannot mis-anchor, because it is only ever applied to a block whose text still *is* the text that was scanned. **No document version counter and no accumulated `Mapping` are required for scan results** — content-addressing replaces both. (An earlier draft specified a `docVersion` counter and a retained `Mapping`; reading Harper's actual API showed they are unnecessary. Do not add them.)

Two identical paragraphs correctly receive the same issues — which is the desired behavior, not a collision.

Undo/redo becomes instant rather than triggering a rescan, since the restored text is already a cache hit.

### 5.4a Verify again before applying a fix

The §5.3 assertion is re-run immediately before a Fix is dispatched as a transaction. A stale squiggle that somehow survived to a click must not be allowed to write to the document.

### 5.5 Stable issue identity — use Harper's context hash

`id = String(await linter.contextHash(blockText, lint))`.

Harper computes a **context-sensitive hash** of a lint (`contextHash(source, lint) → bigint`). It is stable across position shifts and is the same value its native ignore-list keys on (`ignoreLintHash`).

Not `hash(node, offset)` — position-derived IDs change whenever offsets shift, so "Ignore" wouldn't survive an unrelated edit elsewhere in the paragraph, and React keys would churn.

And not a hand-rolled content hash either: using Harper's own value means "Ignore" in our UI and `ignoreLintHash()` in the engine agree by construction, with no mapping layer to drift.

### 5.6 Collaboration (Yjs)

`@inkwell/editor` runs real Yjs collaboration (`y-prosemirror`, `yjs`). Remote transactions **invalidate** affected issues (§5.3) but do **not** schedule a scan — respecting the existing `remote-changes-no-suggestion-trigger` invariant (`docs/INVARIANTS.md`).

## 6. Components

| Path | Responsibility | Depends on |
|---|---|---|
| `packages/grammar/` | Harper wrapper. Async `check()`. Takes a `Linter` by injection. | harper.js |
| `packages/editor/src/extensions/grammar-check/` | PM plugin: dirty-block tracking, debounce, scan protocol, derived decorations. Follows the existing `ghost-text/` convention. | `@inkwell/grammar`, `@tiptap/pm` |
| `apps/web/src/components/GrammarPopover.tsx` | Fix / Ignore / Add to dictionary. | React |

The popover lives in `apps/web` because **`@inkwell/editor` has no `react` dependency** (`packages/editor/package.json`) and must stay framework-agnostic.

**Threading is Harper's job, not ours.** The app injects a `WorkerLinter`, which runs the WASM off the main thread by itself. Tests inject a `LocalLinter`, which works under Node/vitest. `packages/grammar` never references `Worker` directly — it depends only on the `Linter` interface. This is why the engine is testable without a DOM.

## 7. Native spellcheck collision

`spellCheck: true` is the current default and sets `spellcheck="true"` on the contenteditable. Chrome then paints its own red wavy underlines beneath the same misspellings our spelling layer targets.

**When the local spelling layer is active, the editor must set `spellcheck="false"`.** Without this the feature ships visible double-squiggles on day one.

## 8. Toolbar semantics

| Button | Before | After |
|---|---|---|
| `Spell` | fires `Proofread` | **Toggle** — show/hide spelling issues |
| `Grammar` | fires `Proofread` | **Toggle** — show/hide grammar issues |
| `AI Proofread` | fires `Proofread` | Unchanged |

`Spell` and `Grammar` become stateful toggles with an active style, matching how the ribbon already renders mark toggles (bold/italic).

Toggle state and the personal dictionary persist via the existing `settings-store`.

Two squiggle colors only — spelling and grammar. Define exactly two new custom properties, `--grammar-spelling` and `--grammar-grammar`, in `apps/web/src/app/globals.css`, alongside the existing `--diff-del` / `--diff-ins` / `--accent` / `--gold` tokens and following their light/dark convention.

(An earlier draft referenced `--red`, `--blue`, `--purple`, `--gold` as if all four existed. Only `--gold` does.)

## 9. Testing

| Test | Why |
|---|---|
| **Stale-result fuzz** (`fast-check`) — land a scan result after *N* random intervening edits; assert the issue either anchors correctly or is discarded, **never anchors wrong** | The single test that matters. Guards §5.4. |
| **Offset→PM-position property test** over arbitrary block content including marks and hard breaks | Guards §5.1's known hazard. |
| **No-flicker test**, mirroring `ghost-text`'s | Guards the ambient-scan UX. |
| Engine unit tests — deterministic output for fixed input | Guards the value proposition vs. an LLM. |
| Popover apply-fix integration test | Guards §5.4's pre-apply assertion. |

**No new entries in `INVARIANTS.md`.** `INVARIANT_IDS` (`packages/shared/src/constants.ts:37-52`) is exported and imported by **nothing**; invariants are enforced by convention (`// Invariant:` comments), not mechanism. Adding rows would be cosmetic. The proposed `grammar-decorations-never-mutate-doc` also duplicates existing invariant #3 (`decorations-never-serialized`).

## 10. Risks

| Risk | Mitigation |
|---|---|
| Harper's rule quality is weaker than expected | Engine is behind a pure `check()` interface. Swap to `nspell` (spelling-only) without touching the plugin. |
| Harper WASM bundle size in Next.js | Async dynamic import into the Worker; not in the main bundle. |
| Offset→PM mapping breaks on exotic inline content | Property test (§9). Fail closed — discard the issue rather than guess. |
| Ambient scanning janks typing on huge documents | Only *dirty* blocks are scanned, in a Worker, on a ~500ms debounce. |

## 11. What this design deliberately does not do

- Does not call any LLM for inline checks.
- Does not modify `@inkwell/document-ai`.
- Does not add an `OperationType`, a queue priority, or an invariant.
- Does not add a sidebar review pane.
