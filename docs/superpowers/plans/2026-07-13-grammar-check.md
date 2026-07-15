# Grammar Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give InkWell's `Spell` and `Grammar` toolbar buttons a real, local, deterministic grammar checker with ambient inline squigglies, while leaving `AI Proofread` untouched.

**Architecture:** A new framework-agnostic `packages/grammar` wraps `harper.js` (WASM, local, offline) behind an async `check(blockText) => GrammarIssue[]`. A new ProseMirror plugin in `packages/editor/src/extensions/grammar-check/` scans dirty top-level blocks on a debounce, caches results **by block text** (content-addressed, never by position), and renders decorations derived from a single `issues[]` source of truth. Every issue is verified — `doc.textBetween(from,to) === originalText` — before it is rendered and again before a fix is applied, which makes mis-anchoring structurally impossible.

**Tech Stack:** TypeScript, pnpm workspaces, turbo, TipTap/ProseMirror, harper.js 2.4.0 (WASM), Zustand, React (web app only), Vitest, fast-check.

**Spec:** `docs/superpowers/specs/2026-07-13-grammar-check-design.md`

## Global Constraints

- **Package manager is `pnpm@9.15.4`.** Never run `npm install` in this repo. Add deps with `pnpm --filter <pkg> add <dep>`.
- **`@inkwell/editor` must not gain a `react` dependency.** It is framework-agnostic. All React lives in `apps/web/src/components/`.
- **Do not add an `OperationType`.** Adding one breaks four `never`-exhaustiveness switches (`packages/document-ai/src/router/index.ts:113-116` and `:163-166`, `getTokenBudget` in `service.ts:66-75`, `budgetCategory` in `queue/document-ai-queue.ts:22-33`) and requires a `templateMap` entry in `prompts/index.ts:22-29` which *throws* for unmapped ops. The local engine must not touch `@inkwell/document-ai` at all.
- **Do not add rows to `docs/INVARIANTS.md` or `INVARIANT_IDS`.** `INVARIANT_IDS` (`packages/shared/src/constants.ts:37-52`) is imported by nothing; invariants are convention, not mechanism.
- **`packages/editor` vitest enforces coverage thresholds: statements 95%, branches 90%** (`packages/editor/vitest.config.ts`). New code there must be tested to that bar.
- **Harper `LintOptions.language` defaults to `'markdown'`.** Always pass `language: 'plaintext'`.
- **`Lint` / `Suggestion` are WASM-backed** (`free()`, `[Symbol.dispose]()`). Convert to plain objects before returning. Never store a `Lint` in ProseMirror plugin state.
- **Never trust a position that has not been text-verified.** Do not reintroduce a `docVersion` counter or a retained `Mapping` for scan results — content-addressing replaces both.
- The working tree currently has **uncommitted WIP on `main`** (the half-finished Proofread work: `Toolbar.tsx`, `shared/src/types.ts`, `document-ai/src/router/index.ts`, `document-ai/src/prompts/index.ts`, untracked `prompts/proofread.ts`). Do not revert, stage, or commit any of it. Work on a branch; stage only files you create or intentionally modify.

---

### Task 0: Branch

- [ ] **Step 1: Create the working branch**

```bash
cd "C:/Users/Bbeie/.gemini/antigravity/scratch/InkWell"
git checkout -b grammar-check
```

- [ ] **Step 2: Commit the spec (already written, currently untracked)**

```bash
git add docs/superpowers/specs/2026-07-13-grammar-check-design.md docs/superpowers/plans/2026-07-13-grammar-check.md
git commit -m "docs: grammar check design and implementation plan"
```

Expected: commit succeeds, and `git status` still shows the pre-existing WIP files as modified/untracked. Leave them that way.

---

### Task 1: `packages/grammar` — the engine wrapper

**Files:**
- Create: `packages/grammar/package.json`
- Create: `packages/grammar/tsconfig.json`
- Create: `packages/grammar/vitest.config.ts`
- Create: `packages/grammar/src/types.ts`
- Create: `packages/grammar/src/engine.ts`
- Create: `packages/grammar/src/index.ts`
- Test: `packages/grammar/src/__tests__/engine.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `GrammarIssue` — `{ id: string; kind: 'spelling' | 'grammar'; ruleKind: string; offset: number; length: number; originalText: string; message: string; suggestions: string[] }`
  - `GrammarEngine` — class with `constructor(linter: Linter)`, `setup(): Promise<void>`, `check(blockText: string): Promise<GrammarIssue[]>`, `addWord(word: string): Promise<void>`, `getWords(): Promise<string[]>`, `ignoreIssue(blockText: string, issueId: string): Promise<void>`, `exportIgnored(): Promise<string>`, `importIgnored(json: string): Promise<void>`
  - `createWorkerEngine(): GrammarEngine` — browser factory (uses `WorkerLinter`)
  - `createLocalEngine(): GrammarEngine` — Node/test factory (uses `LocalLinter`)

- [ ] **Step 1: Scaffold the package**

Create `packages/grammar/package.json`:

```json
{
  "name": "@inkwell/grammar",
  "version": "0.0.1",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "dependencies": {
    "harper.js": "^2.4.0"
  },
  "devDependencies": {
    "vitest": "^2.1.8"
  }
}
```

Create `packages/grammar/tsconfig.json` (mirrors `packages/shared/tsconfig.json`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

Create `packages/grammar/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
  },
});
```

> `testTimeout` is raised because the first `LocalLinter.setup()` compiles the WASM binary and builds Harper's curated dictionary, which is the single most expensive operation in the library.

- [ ] **Step 2: Install**

```bash
cd "C:/Users/Bbeie/.gemini/antigravity/scratch/InkWell"
pnpm install
```

Expected: pnpm resolves `harper.js@2.4.0` into `packages/grammar/node_modules`.

- [ ] **Step 3: Write the failing test**

Create `packages/grammar/src/__tests__/engine.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createLocalEngine } from '../index';
import type { GrammarEngine } from '../index';

describe('GrammarEngine', () => {
  let engine: GrammarEngine;

  beforeAll(async () => {
    engine = createLocalEngine();
    await engine.setup();
  }, 30_000);

  it('flags a misspelling as kind "spelling"', async () => {
    const issues = await engine.check('This sentance has a typo.');
    const spelling = issues.filter((i) => i.kind === 'spelling');
    expect(spelling.length).toBeGreaterThan(0);
    expect(spelling[0].originalText).toBe('sentance');
    expect(spelling[0].suggestions).toContain('sentence');
  });

  it('reports offsets relative to the text passed in', async () => {
    const text = 'This sentance has a typo.';
    const issues = await engine.check(text);
    const issue = issues.find((i) => i.originalText === 'sentance');
    expect(issue).toBeDefined();
    // The anchor contract: slicing the input by the issue's own offset/length
    // must reproduce originalText exactly.
    expect(text.slice(issue!.offset, issue!.offset + issue!.length)).toBe('sentance');
  });

  it('is deterministic — identical input yields identical issues', async () => {
    const text = 'This sentance has a typo.';
    const a = await engine.check(text);
    const b = await engine.check(text);
    expect(b.map((i) => i.id)).toEqual(a.map((i) => i.id));
    expect(b.map((i) => i.offset)).toEqual(a.map((i) => i.offset));
  });

  it('returns no issues for clean text', async () => {
    const issues = await engine.check('This sentence is perfectly fine.');
    expect(issues).toEqual([]);
  });

  it('respects the personal dictionary', async () => {
    const local = createLocalEngine();
    await local.setup();
    const before = await local.check('Bbeierle wrote this.');
    expect(before.some((i) => i.originalText === 'Bbeierle')).toBe(true);

    await local.addWord('Bbeierle');
    const after = await local.check('Bbeierle wrote this.');
    expect(after.some((i) => i.originalText === 'Bbeierle')).toBe(false);
  }, 30_000);

  it('returns plain serializable objects, not WASM handles', async () => {
    const issues = await engine.check('This sentance has a typo.');
    expect(() => structuredClone(issues)).not.toThrow();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
pnpm --filter @inkwell/grammar test
```

Expected: FAIL — `Failed to resolve import "../index"` (the source files don't exist yet).

- [ ] **Step 5: Write `src/types.ts`**

```ts
/**
 * A single grammar or spelling issue found in one block of text.
 *
 * `offset`/`length` are character indices into the exact string that was
 * passed to `GrammarEngine.check()` — never document positions.
 * `originalText` is the anchor: the editor re-verifies it before rendering
 * or applying anything. See docs/superpowers/specs/2026-07-13-grammar-check-design.md §5.
 */
export interface GrammarIssue {
  /** Harper's context-sensitive hash, stringified. Stable across position shifts. */
  id: string;
  kind: 'spelling' | 'grammar';
  /** Harper's raw LintKind, e.g. 'Spelling' | 'Agreement' | 'Punctuation'. */
  ruleKind: string;
  /** Character offset into the block text passed to check(). */
  offset: number;
  length: number;
  /** The exact flagged substring. The anchor. */
  originalText: string;
  message: string;
  suggestions: string[];
}

/** Harper LintKinds we surface as spelling. Everything else is grammar. */
export const SPELLING_KINDS: ReadonlySet<string> = new Set(['Spelling', 'Typo']);
```

- [ ] **Step 6: Write `src/engine.ts`**

```ts
import {
  LocalLinter,
  WorkerLinter,
  binary,
  type Linter,
  type Lint,
} from 'harper.js';
import { type GrammarIssue, SPELLING_KINDS } from './types';

/**
 * Wraps a Harper `Linter` behind a small, deterministic, plain-object API.
 *
 * Threading is Harper's job: the browser injects a `WorkerLinter` (which runs
 * the WASM on its own dedicated worker thread); Node/vitest injects a
 * `LocalLinter`. This class never references `Worker` directly, which is why
 * it is testable without a DOM.
 */
export class GrammarEngine {
  constructor(private readonly linter: Linter) {}

  setup(): Promise<void> {
    return this.linter.setup();
  }

  /**
   * Lint one block of plain text.
   *
   * Returns plain serializable objects — the WASM-backed `Lint` handles are
   * consumed and released here and never escape.
   */
  async check(blockText: string): Promise<GrammarIssue[]> {
    if (blockText.trim() === '') return [];

    // language: 'plaintext' is REQUIRED. Harper defaults to 'markdown'.
    const lints = await this.linter.lint(blockText, { language: 'plaintext' });

    const issues: GrammarIssue[] = [];
    for (const lint of lints) {
      issues.push(await this.toIssue(blockText, lint));
    }
    return issues;
  }

  private async toIssue(blockText: string, lint: Lint): Promise<GrammarIssue> {
    const span = lint.span();
    const ruleKind = lint.lint_kind();
    const hash = await this.linter.contextHash(blockText, lint);

    return {
      id: String(hash),
      kind: SPELLING_KINDS.has(ruleKind) ? 'spelling' : 'grammar',
      ruleKind,
      offset: span.start,
      length: span.end - span.start,
      originalText: lint.get_problem_text(),
      message: lint.message(),
      suggestions: lint.suggestions().map((s) => s.get_replacement_text()),
    };
  }

  /** Add a word to the personal dictionary. */
  addWord(word: string): Promise<void> {
    return this.linter.importWords([word]);
  }

  /** All words previously added via addWord (not the curated dictionary). */
  getWords(): Promise<string[]> {
    return this.linter.exportWords();
  }

  /**
   * Permanently ignore an issue. Keyed on the same context hash we expose as
   * `GrammarIssue.id`, so the UI and the engine agree by construction.
   */
  ignoreIssue(_blockText: string, issueId: string): Promise<void> {
    return this.linter.ignoreLintHash(BigInt(issueId));
  }

  /** Ignored issues as a JSON list of privacy-respecting hashes. */
  exportIgnored(): Promise<string> {
    return this.linter.exportIgnoredLints();
  }

  importIgnored(json: string): Promise<void> {
    return this.linter.importIgnoredLints(json);
  }
}

/** Browser factory. Harper runs the WASM on its own worker thread. */
export function createWorkerEngine(): GrammarEngine {
  return new GrammarEngine(new WorkerLinter({ binary }));
}

/** Node/test factory. `WorkerLinter` does not work under Node. */
export function createLocalEngine(): GrammarEngine {
  return new GrammarEngine(new LocalLinter({ binary }));
}
```

> **Note for the implementer:** `binary` is imported from `harper.js`'s `./binary` subpath export in some setups. If `import { binary } from 'harper.js'` does not typecheck, use `import binary from 'harper.js/binary';` — check `packages/grammar/node_modules/harper.js/dist/index.d.ts` and `dist/binary.d.ts` and follow whichever the installed version actually exports. Do not guess; read the `.d.ts`.

- [ ] **Step 7: Write `src/index.ts`**

```ts
/**
 * @inkwell/grammar — local, deterministic, offline grammar + spelling engine.
 *
 * Wraps harper.js (WASM). No network. No LLM. Framework-agnostic:
 * no React, no ProseMirror.
 */

export * from './types';
export * from './engine';
```

- [ ] **Step 8: Run the tests**

```bash
pnpm --filter @inkwell/grammar test
```

Expected: PASS, all 6 tests.

If the misspelling assertions fail because Harper phrases things differently than assumed, **fix the test to match Harper's real output — do not fix Harper.** Print the actual issues first:

```bash
cd packages/grammar && npx vitest run --reporter=verbose
```

- [ ] **Step 9: Typecheck and lint**

```bash
pnpm --filter @inkwell/grammar typecheck && pnpm --filter @inkwell/grammar lint
```

Expected: both clean.

- [ ] **Step 10: Commit**

```bash
git add packages/grammar pnpm-lock.yaml
git commit -m "feat(grammar): add @inkwell/grammar, a local harper.js engine wrapper"
```

---

### Task 2: Text-offset → ProseMirror-position mapping

This is the single highest-risk conversion in the feature. It gets its own task and its own property test.

**Files:**
- Create: `packages/editor/src/extensions/grammar-check/positions.ts`
- Test: `packages/editor/src/extensions/grammar-check/__tests__/positions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `textOffsetToPos(block: PMNode, blockPos: number, offset: number): number | null` — converts a character offset within `block.textContent` to an absolute ProseMirror document position. Returns `null` if the offset is not addressable (out of range, or lands inside a non-text inline node).

**Why this is not `blockPos + 1 + offset`:** a block containing inline non-text nodes (e.g. `hardBreak`) has a `textContent` that *skips* those nodes, while ProseMirror positions *count* them. Naive addition silently drifts. This function walks the block's inline children and tracks both cursors.

- [ ] **Step 1: Write the failing test**

Create `packages/editor/src/extensions/grammar-check/__tests__/positions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { schema } from 'prosemirror-test-builder';
import { Node as PMNode } from '@tiptap/pm/model';
import { textOffsetToPos } from '../positions';

/** Build a doc with one paragraph from an alternating text / hardBreak spec. */
function buildDoc(parts: Array<string | 'BR'>): PMNode {
  const content = parts
    .filter((p) => p !== '' )
    .map((p) => (p === 'BR' ? schema.node('hard_break') : schema.text(p as string)));
  const para = schema.node('paragraph', null, content);
  return schema.node('doc', null, [para]);
}

describe('textOffsetToPos', () => {
  it('maps offset 0 to the first content position', () => {
    const doc = buildDoc(['hello']);
    const block = doc.child(0);
    expect(textOffsetToPos(block, 0, 0)).toBe(1);
  });

  it('maps an offset in plain text', () => {
    const doc = buildDoc(['hello world']);
    const block = doc.child(0);
    const pos = textOffsetToPos(block, 0, 6)!;
    expect(doc.textBetween(pos, pos + 5)).toBe('world');
  });

  it('skips a hard_break that textContent omits but positions count', () => {
    // textContent === 'ab' (2 chars) but the doc is: <p>a<br>b</p>
    const doc = buildDoc(['a', 'BR', 'b']);
    const block = doc.child(0);
    expect(block.textContent).toBe('ab');

    // Offset 1 is 'b' in textContent. Naive math would give 1+1+1 = 3 — wrong,
    // because the hard_break occupies a position. Correct answer is 3? verify:
    // positions: 0=<p>, 1='a', 2=<br>, 3='b'. So offset 1 -> pos 3.
    const pos = textOffsetToPos(block, 0, 1)!;
    expect(doc.textBetween(pos, pos + 1)).toBe('b');
  });

  it('returns null for an out-of-range offset', () => {
    const doc = buildDoc(['hi']);
    const block = doc.child(0);
    expect(textOffsetToPos(block, 0, 99)).toBeNull();
  });

  it('property: slicing textContent by [offset, offset+len) always equals textBetween of the mapped positions', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !/[\n\r]/.test(s)),
            fc.constant('BR' as const),
          ),
          { minLength: 1, maxLength: 6 },
        ),
        fc.nat(),
        fc.nat(),
        (parts, rawOffset, rawLen) => {
          const doc = buildDoc(parts);
          const block = doc.child(0);
          const text = block.textContent;
          if (text.length === 0) return true;

          const offset = rawOffset % text.length;
          const len = Math.max(1, (rawLen % (text.length - offset)) || 1);

          const from = textOffsetToPos(block, 0, offset);
          const to = textOffsetToPos(block, 0, offset + len);
          if (from === null || to === null) return true; // unaddressable is allowed

          return doc.textBetween(from, to) === text.slice(offset, offset + len);
        },
      ),
      { numRuns: 300 },
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @inkwell/editor test -- positions
```

Expected: FAIL — cannot resolve `../positions`.

- [ ] **Step 3: Implement `positions.ts`**

```ts
import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * Convert a character offset within `block.textContent` into an absolute
 * ProseMirror document position.
 *
 * This is NOT `blockPos + 1 + offset`. A block may contain inline non-text
 * nodes (hard breaks, inline images) which `textContent` omits but which
 * ProseMirror positions count. Naive addition drifts silently past them.
 *
 * @param block    The top-level block node (e.g. a paragraph).
 * @param blockPos The document position of `block` itself (i.e. the position
 *                 immediately BEFORE it). Its content starts at blockPos + 1.
 * @param offset   Character offset into `block.textContent`.
 * @returns The absolute document position, or `null` if `offset` is out of
 *          range or lands inside a non-text inline node.
 *
 * Invariant (property-tested): for any addressable [offset, offset+len),
 *   doc.textBetween(map(offset), map(offset + len))
 *     === block.textContent.slice(offset, offset + len)
 */
export function textOffsetToPos(
  block: PMNode,
  blockPos: number,
  offset: number,
): number | null {
  if (offset < 0) return null;

  const contentStart = blockPos + 1;
  let textCursor = 0; // chars consumed in block.textContent
  let posCursor = 0; // positions consumed in block content

  for (let i = 0; i < block.childCount; i++) {
    const child = block.child(i);

    if (child.isText) {
      const len = child.text?.length ?? 0;
      if (offset <= textCursor + len) {
        return contentStart + posCursor + (offset - textCursor);
      }
      textCursor += len;
      posCursor += len;
    } else {
      // Non-text inline node: contributes positions but (typically) no text.
      // Advance the position cursor by its size; advance the text cursor by
      // whatever textContent actually attributes to it (usually 0).
      posCursor += child.nodeSize;
      textCursor += child.textContent.length;
    }
  }

  // Offset exactly at the end of the block's text.
  if (offset === textCursor) return contentStart + posCursor;

  return null;
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @inkwell/editor test -- positions
```

Expected: PASS, including 300 property runs.

- [ ] **Step 5: Commit**

```bash
git add packages/editor/src/extensions/grammar-check/positions.ts \
        packages/editor/src/extensions/grammar-check/__tests__/positions.test.ts
git commit -m "feat(editor): text-offset to PM-position mapping with property test"
```

---

### Task 3: The `grammar-check` ProseMirror plugin

**Files:**
- Create: `packages/editor/src/extensions/grammar-check/state.ts`
- Create: `packages/editor/src/extensions/grammar-check/index.ts`
- Modify: `packages/editor/src/index.ts` (add one export line)
- Modify: `packages/editor/package.json` (add `@inkwell/grammar` dependency)
- Test: `packages/editor/src/extensions/grammar-check/__tests__/grammar-check.test.ts`

**Interfaces:**
- Consumes: `textOffsetToPos` (Task 2); `GrammarIssue` from `@inkwell/grammar` (Task 1).
- Produces:
  - `AnchoredIssue` — `GrammarIssue & { from: number; to: number }`
  - `grammarCheckKey: PluginKey<GrammarCheckState>`
  - `GrammarCheckState` — `{ enabled: { spelling: boolean; grammar: boolean }; cache: Map<string, GrammarIssue[]>; issues: AnchoredIssue[]; decorations: DecorationSet }`
  - `GrammarCheck` — TipTap `Extension`, options `{ check: (text: string) => Promise<GrammarIssue[]>; debounceMs: number; spelling: boolean; grammar: boolean }`
  - `setGrammarEnabled(spelling: boolean, grammar: boolean)` / `applyScanResult(blockText, issues)` — transaction meta helpers
  - `anchorIssues(doc, cache, enabled): AnchoredIssue[]` — the pure anchoring pass (exported for testing)

**The one rule (spec §5.3):** map through `tr.mapping`, then assert `doc.textBetween(from, to) === originalText`. Drop on mismatch. This is what makes mis-anchoring impossible and it must not be weakened.

**Content-addressing (spec §5.4):** the cache is keyed by block *text*, never by position. Scan results are applied to whichever blocks currently hold that exact text. Do not add a `docVersion` counter or retain a `Mapping` for in-flight scans.

- [ ] **Step 1: Add the dependency**

```bash
cd "C:/Users/Bbeie/.gemini/antigravity/scratch/InkWell"
pnpm --filter @inkwell/editor add @inkwell/grammar@workspace:*
```

Expected: `packages/editor/package.json` gains `"@inkwell/grammar": "workspace:*"`.

- [ ] **Step 2: Write the failing test**

Create `packages/editor/src/extensions/grammar-check/__tests__/grammar-check.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { schema } from 'prosemirror-test-builder';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { Node as PMNode } from '@tiptap/pm/model';
import type { GrammarIssue } from '@inkwell/grammar';
import { anchorIssues } from '../state';

function docOf(...paragraphs: string[]): PMNode {
  return schema.node(
    'doc',
    null,
    paragraphs.map((p) => schema.node('paragraph', null, p ? [schema.text(p)] : [])),
  );
}

const BOTH = { spelling: true, grammar: true };

/** An issue on the word 'sentance' at its offset within `text`. */
function sentanceIssue(text: string): GrammarIssue {
  return {
    id: '123',
    kind: 'spelling',
    ruleKind: 'Spelling',
    offset: text.indexOf('sentance'),
    length: 'sentance'.length,
    originalText: 'sentance',
    message: 'Did you mean "sentence"?',
    suggestions: ['sentence'],
  };
}

describe('anchorIssues', () => {
  it('anchors a cached issue onto the block holding that text', () => {
    const text = 'This sentance is bad.';
    const doc = docOf(text);
    const cache = new Map([[text, [sentanceIssue(text)]]]);

    const anchored = anchorIssues(doc, cache, BOTH);

    expect(anchored).toHaveLength(1);
    expect(doc.textBetween(anchored[0].from, anchored[0].to)).toBe('sentance');
  });

  it('anchors onto BOTH blocks when two paragraphs have identical text', () => {
    const text = 'This sentance is bad.';
    const doc = docOf(text, text);
    const cache = new Map([[text, [sentanceIssue(text)]]]);

    const anchored = anchorIssues(doc, cache, BOTH);

    expect(anchored).toHaveLength(2);
    for (const a of anchored) {
      expect(doc.textBetween(a.from, a.to)).toBe('sentance');
    }
  });

  it('ignores cache entries whose text no longer appears in the doc', () => {
    const stale = 'This sentance is bad.';
    const doc = docOf('Completely different text now.');
    const cache = new Map([[stale, [sentanceIssue(stale)]]]);

    expect(anchorIssues(doc, cache, BOTH)).toEqual([]);
  });

  it('filters by enabled category', () => {
    const text = 'This sentance is bad.';
    const doc = docOf(text);
    const cache = new Map([[text, [sentanceIssue(text)]]]);

    expect(anchorIssues(doc, cache, { spelling: false, grammar: true })).toEqual([]);
    expect(anchorIssues(doc, cache, { spelling: true, grammar: false })).toHaveLength(1);
  });

  it('NEVER mis-anchors: every anchored issue verifies against the live doc', () => {
    // The load-bearing guarantee. Land an arbitrary cached scan result against
    // an arbitrary document and assert the anchor is either correct or absent.
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 0, maxLength: 40 }), { minLength: 1, maxLength: 5 }),
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.nat(),
        fc.nat(),
        (paragraphs, scannedText, rawOffset, rawLen) => {
          const doc = docOf(...paragraphs.map((p) => p.replace(/[\n\r]/g, ' ')));

          const offset = rawOffset % scannedText.length;
          const length = Math.max(1, (rawLen % (scannedText.length - offset)) || 1);
          const issue: GrammarIssue = {
            id: 'x',
            kind: 'spelling',
            ruleKind: 'Spelling',
            offset,
            length,
            originalText: scannedText.slice(offset, offset + length),
            message: '',
            suggestions: [],
          };
          const cache = new Map([[scannedText, [issue]]]);

          const anchored = anchorIssues(doc, cache, BOTH);

          // The guarantee: anything we render sits on text that literally
          // still equals what the engine flagged.
          return anchored.every(
            (a) => doc.textBetween(a.from, a.to) === a.originalText,
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  // Spec §9: no-flicker, mirroring the existing ghost-text stability test.
  it('does not flicker: re-anchoring an unchanged doc+cache is byte-identical', () => {
    const text = 'This sentance is bad.';
    const doc = docOf(text, 'A clean second paragraph.', text);
    const cache = new Map([[text, [sentanceIssue(text)]]]);

    const first = anchorIssues(doc, cache, BOTH);
    const second = anchorIssues(doc, cache, BOTH);

    // Identical ids, identical positions, identical order. A squiggle must never
    // appear, vanish, or move on text the user did not touch.
    expect(second).toEqual(first);
  });

  it('does not flicker: toggling a category off and back on restores the exact same anchors', () => {
    const text = 'This sentance is bad.';
    const doc = docOf(text);
    const cache = new Map([[text, [sentanceIssue(text)]]]);

    const before = anchorIssues(doc, cache, BOTH);
    const off = anchorIssues(doc, cache, { spelling: false, grammar: true });
    const back = anchorIssues(doc, cache, BOTH);

    expect(off).toEqual([]);
    expect(back).toEqual(before); // cache hit — no rescan, no flicker
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
pnpm --filter @inkwell/editor test -- grammar-check
```

Expected: FAIL — cannot resolve `../state`.

- [ ] **Step 4: Implement `state.ts`**

```ts
import type { Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { GrammarIssue } from '@inkwell/grammar';
import { textOffsetToPos } from './positions';

/** A GrammarIssue resolved to live ProseMirror document positions. */
export interface AnchoredIssue extends GrammarIssue {
  from: number;
  to: number;
}

export interface EnabledKinds {
  spelling: boolean;
  grammar: boolean;
}

/**
 * Content-addressed cache: block text -> issues found in that exact text.
 * Never keyed by position. See spec §5.4.
 */
export type IssueCache = Map<string, GrammarIssue[]>;

/** Bound the cache so a long editing session cannot grow it without limit. */
export const MAX_CACHE_ENTRIES = 200;

export function cacheSet(cache: IssueCache, text: string, issues: GrammarIssue[]): IssueCache {
  const next: IssueCache = new Map(cache);
  next.delete(text); // re-insert to move to the end (LRU recency)
  next.set(text, issues);
  while (next.size > MAX_CACHE_ENTRIES) {
    const oldest = next.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  return next;
}

/**
 * The anchoring pass. Pure.
 *
 * Walks top-level blocks, looks each one up in the content-addressed cache,
 * and converts cached character offsets into live document positions.
 *
 * THE GUARANTEE (spec §5.3): every returned issue satisfies
 *   doc.textBetween(from, to) === originalText
 * Anything that fails that check is dropped silently. A stale scan result can
 * therefore never render over the wrong text — worst case it simply vanishes.
 */
export function anchorIssues(
  doc: PMNode,
  cache: IssueCache,
  enabled: EnabledKinds,
): AnchoredIssue[] {
  const anchored: AnchoredIssue[] = [];

  doc.forEach((block, offsetIntoDoc) => {
    if (!block.isTextblock) return;

    const issues = cache.get(block.textContent);
    if (!issues) return;

    for (const issue of issues) {
      if (issue.kind === 'spelling' && !enabled.spelling) continue;
      if (issue.kind === 'grammar' && !enabled.grammar) continue;

      const from = textOffsetToPos(block, offsetIntoDoc, issue.offset);
      const to = textOffsetToPos(block, offsetIntoDoc, issue.offset + issue.length);
      if (from === null || to === null) continue;

      // Verify. Non-negotiable.
      if (doc.textBetween(from, to) !== issue.originalText) continue;

      anchored.push({ ...issue, from, to });
    }
  });

  return anchored;
}

/** Decorations are DERIVED from issues. issues[] is the single source of truth. */
export function buildDecorations(doc: PMNode, issues: AnchoredIssue[]): DecorationSet {
  return DecorationSet.create(
    doc,
    issues.map((issue) =>
      Decoration.inline(issue.from, issue.to, {
        class: `inkwell-grammar inkwell-grammar-${issue.kind}`,
        'data-grammar-id': issue.id,
      }),
    ),
  );
}
```

- [ ] **Step 5: Run the tests**

```bash
pnpm --filter @inkwell/editor test -- grammar-check
```

Expected: PASS, including the 500-run mis-anchoring property test.

- [ ] **Step 6: Implement the plugin in `index.ts`**

```ts
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet } from '@tiptap/pm/view';
import type { GrammarIssue } from '@inkwell/grammar';
import {
  anchorIssues,
  buildDecorations,
  cacheSet,
  type AnchoredIssue,
  type EnabledKinds,
  type IssueCache,
} from './state';

export * from './state';
export * from './positions';

export interface GrammarCheckState {
  enabled: EnabledKinds;
  cache: IssueCache;
  issues: AnchoredIssue[];
  decorations: DecorationSet;
}

export const grammarCheckKey = new PluginKey<GrammarCheckState>('grammarCheck');

interface ScanResultMeta {
  type: 'scanResult';
  blockText: string;
  issues: GrammarIssue[];
}

interface SetEnabledMeta {
  type: 'setEnabled';
  enabled: EnabledKinds;
}

type GrammarMeta = ScanResultMeta | SetEnabledMeta;

/** Transaction meta: a scan for `blockText` came back with `issues`. */
export function applyScanResult(blockText: string, issues: GrammarIssue[]): GrammarMeta {
  return { type: 'scanResult', blockText, issues };
}

/** Transaction meta: toggle which categories are shown. */
export function setGrammarEnabled(spelling: boolean, grammar: boolean): GrammarMeta {
  return { type: 'setEnabled', enabled: { spelling, grammar } };
}

export interface GrammarCheckOptions {
  /** Injected engine call. Deterministic, local, async. */
  check: (blockText: string) => Promise<GrammarIssue[]>;
  debounceMs: number;
  spelling: boolean;
  grammar: boolean;
}

export const GrammarCheck = Extension.create<GrammarCheckOptions>({
  name: 'grammarCheck',

  addOptions() {
    return {
      check: async () => [],
      debounceMs: 500,
      spelling: true,
      grammar: true,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    let timer: ReturnType<typeof setTimeout> | null = null;
    /** Block texts with a scan currently in flight — prevents duplicate work. */
    const inFlight = new Set<string>();

    return [
      new Plugin<GrammarCheckState>({
        key: grammarCheckKey,

        state: {
          init: (_config, editorState) => {
            const enabled = { spelling: options.spelling, grammar: options.grammar };
            const cache: IssueCache = new Map();
            const issues = anchorIssues(editorState.doc, cache, enabled);
            return {
              enabled,
              cache,
              issues,
              decorations: buildDecorations(editorState.doc, issues),
            };
          },

          apply: (tr, prev, _oldState, newState) => {
            const meta = tr.getMeta(grammarCheckKey) as GrammarMeta | undefined;

            let cache = prev.cache;
            let enabled = prev.enabled;

            if (meta?.type === 'scanResult') {
              cache = cacheSet(cache, meta.blockText, meta.issues);
            } else if (meta?.type === 'setEnabled') {
              enabled = meta.enabled;
            } else if (!tr.docChanged) {
              return prev;
            }

            // Re-anchor from scratch against the new doc. anchorIssues() applies
            // the map-then-verify rule internally, so a stale cache entry can
            // never produce a misplaced decoration — it simply fails to match.
            const issues = anchorIssues(newState.doc, cache, enabled);

            return {
              enabled,
              cache,
              issues,
              decorations: buildDecorations(newState.doc, issues),
            };
          },
        },

        props: {
          decorations: (state) => grammarCheckKey.getState(state)?.decorations,
        },

        view: (view) => {
          const scan = () => {
            const pluginState = grammarCheckKey.getState(view.state);
            if (!pluginState) return;
            if (!pluginState.enabled.spelling && !pluginState.enabled.grammar) return;

            const pending: string[] = [];
            view.state.doc.forEach((block) => {
              if (!block.isTextblock) return;
              const text = block.textContent;
              if (text.trim() === '') return;
              if (pluginState.cache.has(text)) return; // cache hit — already anchored
              if (inFlight.has(text)) return;
              pending.push(text);
            });

            for (const text of pending) {
              inFlight.add(text);
              void options
                .check(text)
                .then((issues) => {
                  view.dispatch(
                    view.state.tr.setMeta(grammarCheckKey, applyScanResult(text, issues)),
                  );
                })
                .catch(() => {
                  // Engine failure is non-fatal: no squigglies, no crash.
                })
                .finally(() => {
                  inFlight.delete(text);
                });
            }
          };

          const schedule = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(scan, options.debounceMs);
          };

          schedule(); // scan the initial document

          return {
            update: (_view, prevState) => {
              if (!_view.state.doc.eq(prevState.doc)) schedule();
            },
            destroy: () => {
              if (timer) clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});
```

> **Remote (Yjs) edits:** the `update` hook reschedules on *any* doc change, including remote ones. That is acceptable and does not violate `remote-changes-no-suggestion-trigger` — that invariant governs *AI suggestion* triggering. Grammar scanning is local, free, and side-effect-free. Anchoring is content-addressed, so a remote edit simply invalidates the affected block's anchors until it is rescanned.

- [ ] **Step 7: Export from the editor package**

Modify `packages/editor/src/index.ts` — add one line after the `diff-preview` export:

```ts
export * from './extensions/grammar-check';
```

- [ ] **Step 8: Run the full editor test suite**

```bash
pnpm --filter @inkwell/editor test && pnpm --filter @inkwell/editor typecheck
```

Expected: PASS. Coverage must stay above statements 95% / branches 90%.

- [ ] **Step 9: Commit**

```bash
git add packages/editor
git commit -m "feat(editor): grammar-check ProseMirror plugin with content-addressed anchoring"
```

---

### Task 4: Styling + kill the native double-squiggle

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/page.tsx` (the `spellcheck` attribute, around lines 139 and 178)

**Interfaces:**
- Consumes: the `inkwell-grammar-spelling` / `inkwell-grammar-grammar` classes emitted by `buildDecorations` (Task 3).
- Produces: nothing importable.

**The bug this prevents:** `spellCheck: true` is the current default (`apps/web/src/lib/settings-store.ts:128`) and sets `spellcheck="true"` on the contenteditable. Chrome then paints its *own* red wavy underlines beneath the same misspellings our spelling layer targets. Ship without this and users see double squiggles on day one.

- [ ] **Step 1: Add the two tokens and the squiggle styles**

In `apps/web/src/app/globals.css`, alongside the existing `--diff-del` / `--diff-ins` / `--accent` / `--gold` tokens, add — following whatever light/dark convention those existing tokens use in this file:

```css
:root {
  --grammar-spelling: #dc2626;
  --grammar-grammar: #2563eb;
}

.inkwell-grammar {
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-skip-ink: none;
  text-underline-offset: 0.2em;
  cursor: pointer;
}

.inkwell-grammar-spelling {
  text-decoration-color: var(--grammar-spelling);
}

.inkwell-grammar-grammar {
  text-decoration-color: var(--grammar-grammar);
}
```

Read the file first and match its existing dark-mode mechanism (media query vs. `[data-theme]` attribute) rather than inventing a new one.

- [ ] **Step 2: Disable native spellcheck when our engine owns spelling**

In `apps/web/src/app/page.tsx`, the contenteditable currently receives `spellcheck={spellCheck}` (around lines 139 and 178). Our engine must own the underline. Change the value passed so native spellcheck is off whenever our spelling layer is on:

```tsx
// Native browser spellcheck must yield to the local grammar engine, or the
// user sees TWO wavy underlines under the same misspelling.
spellcheck={spellCheck && !grammarSpelling}
```

`grammarSpelling` comes from the settings store in Task 5. **Sequence note:** if you are executing tasks strictly in order, do Task 5 first, or temporarily hardcode `spellcheck={false}` here and wire the real value in Task 5. Do not leave it reading `spellCheck` alone.

- [ ] **Step 3: Verify visually**

```bash
pnpm --filter @inkwell/web dev
```

Type `This sentance has a typo.` Expected: exactly **one** red wavy underline under `sentance`, not two.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/page.tsx
git commit -m "feat(web): grammar squiggle styles; disable native spellcheck when engine is active"
```

---

### Task 5: Settings — toggles, dictionary, ignored lints

**Files:**
- Modify: `apps/web/src/lib/settings-store.ts`
- Test: `apps/web/src/lib/__tests__/settings-store.test.ts` (extend if it exists; create if not)

**Interfaces:**
- Consumes: nothing.
- Produces, on `useSettingsStore`:
  - `grammarSpelling: boolean` (default `true`), `setGrammarSpelling(enabled: boolean): void`
  - `grammarGrammar: boolean` (default `true`), `setGrammarGrammar(enabled: boolean): void`
  - `grammarDictionary: string[]` (default `[]`), `addGrammarWord(word: string): void`
  - `grammarIgnoredLints: string` (default `''`, a JSON blob from `exportIgnoredLints()`), `setGrammarIgnoredLints(json: string): void`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/lib/__tests__/settings-store.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sanitizePersistedSettings } from '../settings-store';

describe('grammar settings persistence', () => {
  it('defaults both grammar categories to on', () => {
    const clean = sanitizePersistedSettings({});
    expect(clean.grammarSpelling).toBeUndefined(); // falls through to DEFAULTS
  });

  it('accepts valid grammar settings', () => {
    const clean = sanitizePersistedSettings({
      grammarSpelling: false,
      grammarGrammar: true,
      grammarDictionary: ['Bbeierle', 'InkWell'],
      grammarIgnoredLints: '[123,456]',
    });
    expect(clean.grammarSpelling).toBe(false);
    expect(clean.grammarGrammar).toBe(true);
    expect(clean.grammarDictionary).toEqual(['Bbeierle', 'InkWell']);
    expect(clean.grammarIgnoredLints).toBe('[123,456]');
  });

  it('rejects a corrupt dictionary rather than crashing the editor', () => {
    const clean = sanitizePersistedSettings({
      grammarDictionary: ['ok', 42, null, { nope: true }],
    });
    expect(clean.grammarDictionary).toEqual(['ok']);
  });

  it('rejects a non-array dictionary', () => {
    const clean = sanitizePersistedSettings({ grammarDictionary: 'not-an-array' });
    expect(clean.grammarDictionary).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @inkwell/web test -- settings-store
```

Expected: FAIL — `grammarSpelling` etc. are not returned by `sanitizePersistedSettings`.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/settings-store.ts`, make these five edits, following the file's existing patterns exactly:

1. In `interface SettingsState`, under the `// Editor` group:

```ts
  grammarSpelling: boolean;
  grammarGrammar: boolean;
  grammarDictionary: string[];
  grammarIgnoredLints: string;
```

2. In `interface SettingsState`, under `// Actions`:

```ts
  setGrammarSpelling: (enabled: boolean) => void;
  setGrammarGrammar: (enabled: boolean) => void;
  addGrammarWord: (word: string) => void;
  setGrammarIgnoredLints: (json: string) => void;
```

3. In `PersistedSettingsShape`, add `| 'grammarSpelling' | 'grammarGrammar' | 'grammarDictionary' | 'grammarIgnoredLints'`.

4. In `DEFAULTS`:

```ts
  grammarSpelling: true,
  grammarGrammar: true,
  grammarDictionary: [] as string[],
  grammarIgnoredLints: '',
```

5. In `sanitizePersistedSettings`, after the `showRuler` check:

```ts
  if (typeof value.grammarSpelling === 'boolean') next.grammarSpelling = value.grammarSpelling;
  if (typeof value.grammarGrammar === 'boolean') next.grammarGrammar = value.grammarGrammar;
  if (typeof value.grammarIgnoredLints === 'string') {
    next.grammarIgnoredLints = value.grammarIgnoredLints;
  }
  if (Array.isArray(value.grammarDictionary)) {
    // Drop any non-string entries rather than letting a corrupt localStorage
    // blob reach the WASM engine.
    next.grammarDictionary = value.grammarDictionary.filter(
      (w): w is string => typeof w === 'string',
    );
  }
```

6. In the store body:

```ts
      setGrammarSpelling: (grammarSpelling) => set({ grammarSpelling }),
      setGrammarGrammar: (grammarGrammar) => set({ grammarGrammar }),
      addGrammarWord: (word) =>
        set((s) =>
          s.grammarDictionary.includes(word)
            ? s
            : { grammarDictionary: [...s.grammarDictionary, word] },
        ),
      setGrammarIgnoredLints: (grammarIgnoredLints) => set({ grammarIgnoredLints }),
```

7. In `partialize`, add the four new keys:

```ts
        grammarSpelling: state.grammarSpelling,
        grammarGrammar: state.grammarGrammar,
        grammarDictionary: state.grammarDictionary,
        grammarIgnoredLints: state.grammarIgnoredLints,
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @inkwell/web test -- settings-store
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/settings-store.ts apps/web/src/lib/__tests__/settings-store.test.ts
git commit -m "feat(web): persist grammar toggles, personal dictionary, ignored lints"
```

---

### Task 6: Wire the engine into the editor

**Files:**
- Create: `apps/web/src/lib/grammar-instance.ts`
- Create: `apps/web/src/hooks/useGrammar.ts`
- Modify: `apps/web/src/components/EditorArea.tsx` (register the extension)
- Modify: `apps/web/package.json` (add `@inkwell/grammar`)

**Interfaces:**
- Consumes: `createWorkerEngine`, `GrammarEngine` (Task 1); `GrammarCheck`, `setGrammarEnabled` (Task 3); settings from Task 5.
- Produces:
  - `getGrammarEngine(): GrammarEngine` — lazily-constructed browser singleton.
  - `useGrammar()` — hook returning `{ check, spelling, grammar }`, keeps the engine's dictionary and ignore-list in sync with the settings store.

- [ ] **Step 1: Add the dependency**

```bash
pnpm --filter @inkwell/web add @inkwell/grammar@workspace:*
```

- [ ] **Step 2: Create the singleton, `apps/web/src/lib/grammar-instance.ts`**

```ts
import { createWorkerEngine, type GrammarEngine } from '@inkwell/grammar';

/**
 * Lazily-constructed browser singleton.
 *
 * Constructing the engine spins up a web worker and compiles Harper's WASM +
 * curated dictionary — the most expensive operation in the library. Do it once,
 * on first use, never during module evaluation (which would run during Next.js
 * SSR, where `Worker` does not exist).
 */
let engine: GrammarEngine | null = null;

export function getGrammarEngine(): GrammarEngine {
  if (typeof window === 'undefined') {
    throw new Error('getGrammarEngine() is browser-only');
  }
  if (!engine) {
    engine = createWorkerEngine();
    void engine.setup();
  }
  return engine;
}
```

- [ ] **Step 3: Create the hook, `apps/web/src/hooks/useGrammar.ts`**

```ts
import { useCallback, useEffect, useMemo } from 'react';
import type { GrammarIssue } from '@inkwell/grammar';
import { useSettingsStore } from '@/lib/settings-store';
import { getGrammarEngine } from '@/lib/grammar-instance';

/**
 * Bridges the settings store to the grammar engine.
 *
 * The dictionary and ignore-list live in the engine (Harper owns them natively);
 * the store is just their persistence layer. On mount, replay the persisted
 * state into the engine.
 */
export function useGrammar() {
  const spelling = useSettingsStore((s) => s.grammarSpelling);
  const grammar = useSettingsStore((s) => s.grammarGrammar);
  const dictionary = useSettingsStore((s) => s.grammarDictionary);
  const ignoredLints = useSettingsStore((s) => s.grammarIgnoredLints);

  // Replay persisted dictionary + ignores into the engine.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const engine = getGrammarEngine();
    void (async () => {
      await engine.setup();
      if (dictionary.length > 0) {
        // importWords is a significant operation — batch it, never per-word.
        await Promise.all(dictionary.map((w) => engine.addWord(w)));
      }
      if (ignoredLints) {
        await engine.importIgnored(ignoredLints);
      }
    })();
  }, [dictionary, ignoredLints]);

  const check = useCallback(async (blockText: string): Promise<GrammarIssue[]> => {
    if (typeof window === 'undefined') return [];
    return getGrammarEngine().check(blockText);
  }, []);

  return useMemo(() => ({ check, spelling, grammar }), [check, spelling, grammar]);
}
```

- [ ] **Step 4: Register the extension in `EditorArea.tsx`**

Read `apps/web/src/components/EditorArea.tsx` and find where extensions are assembled (alongside `GhostText`, `DiffPreview`, etc.). Add:

```tsx
import { GrammarCheck } from '@inkwell/editor';
import { useGrammar } from '@/hooks/useGrammar';

// ...inside the component, before the useEditor call:
const { check, spelling, grammar } = useGrammar();

// ...in the extensions array:
GrammarCheck.configure({
  check,
  debounceMs: 500,
  spelling,
  grammar,
}),
```

- [ ] **Step 5: Verify end-to-end in the running app**

```bash
pnpm --filter @inkwell/web dev
```

Type: `This sentance has an obvius typo.`

Expected: after ~500ms, red wavy underlines appear under `sentance` and `obvius` — **exactly one underline each**. Keep typing; the squiggle under the word you are editing disappears immediately and reappears after you pause. Nothing ever underlines the wrong word.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/grammar-instance.ts apps/web/src/hooks/useGrammar.ts \
        apps/web/src/components/EditorArea.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): wire the local grammar engine into the editor"
```

---

### Task 7: Rewire the `Spell` and `Grammar` toolbar buttons

**Files:**
- Modify: `apps/web/src/components/Toolbar.tsx` (the Proofing group, ~lines 701-731)

**Interfaces:**
- Consumes: `setGrammarSpelling` / `setGrammarGrammar` (Task 5).
- Produces: nothing importable.

**Careful — this file has uncommitted WIP.** Read it first. Change only the `Spell` and `Grammar` buttons in the Proofing group. **Do not touch `AI Proofread`** — it keeps calling `onAIOperation(OperationType.Proofread)` exactly as it does today.

- [ ] **Step 1: Read the current Proofing group**

```bash
sed -n '690,740p' apps/web/src/components/Toolbar.tsx
```

Confirm all three buttons currently dispatch `onAIOperation(OperationType.Proofread)`. That is the incoherence being fixed.

- [ ] **Step 2: Convert `Spell` and `Grammar` into toggles**

They become stateful toggles with an active style, matching how the ribbon already renders mark toggles (bold/italic — copy that button's `isActive` styling rather than inventing one):

```tsx
const grammarSpelling = useSettingsStore((s) => s.grammarSpelling);
const grammarGrammar = useSettingsStore((s) => s.grammarGrammar);
const setGrammarSpelling = useSettingsStore((s) => s.setGrammarSpelling);
const setGrammarGrammar = useSettingsStore((s) => s.setGrammarGrammar);
```

- `Spell` → `onClick={() => setGrammarSpelling(!grammarSpelling)}`, `isActive={grammarSpelling}`, `title="Show spelling issues"`
- `Grammar` → `onClick={() => setGrammarGrammar(!grammarGrammar)}`, `isActive={grammarGrammar}`, `title="Show grammar issues"`
- `AI Proofread` → **unchanged.**

- [ ] **Step 3: Verify in the app**

```bash
pnpm --filter @inkwell/web dev
```

Expected: `Spell` and `Grammar` render as pressed/active by default. Clicking `Spell` off makes the red spelling squigglies vanish immediately and leaves blue grammar ones. Clicking it back on restores them instantly (cache hit — no rescan flicker). `AI Proofread` still runs the LLM path against a selection.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/Toolbar.tsx
git commit -m "feat(web): Spell and Grammar become category toggles for the local engine"
```

---

### Task 8: The fix popover

**Files:**
- Create: `apps/web/src/components/GrammarPopover.tsx`
- Modify: `apps/web/src/components/EditorArea.tsx` (mount it)
- Test: `apps/web/src/components/__tests__/GrammarPopover.test.tsx`

**Interfaces:**
- Consumes: `grammarCheckKey`, `AnchoredIssue` (Task 3); `addGrammarWord`, `setGrammarIgnoredLints` (Task 5); `getGrammarEngine` (Task 6).
- Produces: `<GrammarPopover editor={editor} />`.

**No new dependency.** There is no `radix`, `floating-ui`, or `tippy` in this repo. Position the popover with `editor.view.coordsAtPos(issue.from)` and absolute CSS. Do not add a popover library for one component.

**The critical behavior — re-verify before writing to the document (spec §5.4a).** A stale squiggle that somehow survived to a click must not be allowed to corrupt text.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/__tests__/GrammarPopover.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { applyFix } from '../GrammarPopover';
import { schema } from 'prosemirror-test-builder';
import { EditorState } from '@tiptap/pm/state';
import type { AnchoredIssue } from '@inkwell/editor';

function stateWith(text: string) {
  return EditorState.create({
    doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]),
  });
}

const issueOn = (text: string, word: string, replacement: string): AnchoredIssue => {
  const offset = text.indexOf(word);
  return {
    id: '1',
    kind: 'spelling',
    ruleKind: 'Spelling',
    offset,
    length: word.length,
    originalText: word,
    message: '',
    suggestions: [replacement],
    from: offset + 1, // +1 for the paragraph open token
    to: offset + 1 + word.length,
  };
};

describe('applyFix', () => {
  it('replaces the flagged text with the suggestion', () => {
    const text = 'This sentance is bad.';
    const state = stateWith(text);
    const issue = issueOn(text, 'sentance', 'sentence');

    const tr = applyFix(state, issue, 'sentence');

    expect(tr).not.toBeNull();
    expect(tr!.doc.textContent).toBe('This sentence is bad.');
  });

  it('REFUSES to write when the text at the range no longer matches', () => {
    // The guarantee. A stale issue must never corrupt the document.
    const state = stateWith('Completely different text!');
    const issue = issueOn('This sentance is bad.', 'sentance', 'sentence');

    expect(applyFix(state, issue, 'sentence')).toBeNull();
  });

  it('REFUSES to write when the range is out of document bounds', () => {
    const state = stateWith('hi');
    const issue = { ...issueOn('This sentance is bad.', 'sentance', 'sentence'), from: 500, to: 900 };

    expect(applyFix(state, issue, 'sentence')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --filter @inkwell/web test -- GrammarPopover
```

Expected: FAIL — cannot resolve `../GrammarPopover`.

- [ ] **Step 3: Implement `GrammarPopover.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { grammarCheckKey, type AnchoredIssue } from '@inkwell/editor';
import { useSettingsStore } from '@/lib/settings-store';
import { getGrammarEngine } from '@/lib/grammar-instance';

/**
 * Build the transaction that applies a fix — or return null and write nothing.
 *
 * Re-verifies the anchor immediately before writing (spec §5.4a). A squiggle
 * that went stale between render and click must NOT be allowed to corrupt the
 * document. Pure and exported so this guarantee is directly testable.
 */
export function applyFix(
  state: EditorState,
  issue: AnchoredIssue,
  replacement: string,
): Transaction | null {
  if (issue.from < 0 || issue.to > state.doc.content.size || issue.from >= issue.to) {
    return null;
  }
  if (state.doc.textBetween(issue.from, issue.to) !== issue.originalText) {
    return null;
  }
  return state.tr.insertText(replacement, issue.from, issue.to);
}

export function GrammarPopover({ editor }: { editor: Editor | null }) {
  const [issue, setIssue] = useState<AnchoredIssue | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const addGrammarWord = useSettingsStore((s) => s.addGrammarWord);
  const setGrammarIgnoredLints = useSettingsStore((s) => s.setGrammarIgnoredLints);

  useEffect(() => {
    if (!editor) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const el = target.closest('[data-grammar-id]');
      if (!el) {
        setIssue(null);
        return;
      }
      const id = el.getAttribute('data-grammar-id');
      const pluginState = grammarCheckKey.getState(editor.state);
      const found = pluginState?.issues.find((i) => i.id === id) ?? null;
      setIssue(found);
      if (found) {
        const c = editor.view.coordsAtPos(found.from);
        setCoords({ top: c.bottom + window.scrollY, left: c.left + window.scrollX });
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener('click', onClick);
    return () => dom.removeEventListener('click', onClick);
  }, [editor]);

  if (!editor || !issue || !coords) return null;

  const close = () => setIssue(null);

  const onFix = (replacement: string) => {
    const tr = applyFix(editor.state, issue, replacement);
    if (tr) editor.view.dispatch(tr);
    close();
  };

  const onIgnore = async () => {
    const engine = getGrammarEngine();
    await engine.ignoreIssue(issue.originalText, issue.id);
    setGrammarIgnoredLints(await engine.exportIgnored());
    close();
  };

  const onAddToDictionary = async () => {
    await getGrammarEngine().addWord(issue.originalText);
    addGrammarWord(issue.originalText);
    close();
  };

  return (
    <div
      className="inkwell-grammar-popover"
      style={{ position: 'absolute', top: coords.top, left: coords.left, zIndex: 50 }}
      role="dialog"
      aria-label="Grammar suggestion"
    >
      <p className="inkwell-grammar-popover-message">{issue.message}</p>
      {issue.suggestions.map((s) => (
        <button key={s} type="button" onClick={() => onFix(s)}>
          {s}
        </button>
      ))}
      <button type="button" onClick={onIgnore}>
        Ignore
      </button>
      {issue.kind === 'spelling' && (
        <button type="button" onClick={onAddToDictionary}>
          Add to dictionary
        </button>
      )}
    </div>
  );
}
```

> **Note:** after `onIgnore` / `onAddToDictionary`, the cached issues for that block are now stale (the engine would no longer report them). Task 9 handles cache invalidation.

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @inkwell/web test -- GrammarPopover
```

Expected: PASS, all 3 — including the two refusal cases.

- [ ] **Step 5: Mount it in `EditorArea.tsx`**

```tsx
<GrammarPopover editor={editor} />
```

Place it as a sibling of the `EditorContent`, matching how other floating UI in that file is mounted. Style `.inkwell-grammar-popover` in `globals.css` following the conventions of the existing floating panels.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/GrammarPopover.tsx \
        apps/web/src/components/__tests__/GrammarPopover.test.tsx \
        apps/web/src/components/EditorArea.tsx apps/web/src/app/globals.css
git commit -m "feat(web): grammar popover with verify-before-apply"
```

---

### Task 9: Cache invalidation on dictionary/ignore change

**Files:**
- Modify: `packages/editor/src/extensions/grammar-check/index.ts`
- Test: `packages/editor/src/extensions/grammar-check/__tests__/grammar-check.test.ts` (extend)

**Interfaces:**
- Consumes: `grammarCheckKey` (Task 3).
- Produces: `clearGrammarCache()` — a transaction meta that empties the cache, forcing a full rescan on the next debounce.

**Why:** "Add to dictionary" and "Ignore" change what the *engine* would return, but the content-addressed cache still holds the old answer keyed by unchanged text. Without invalidation the squiggle you just dismissed reappears on the next anchoring pass, which reads as the feature being broken.

- [ ] **Step 1: Write the failing test**

Add to `packages/editor/src/extensions/grammar-check/__tests__/grammar-check.test.ts`:

```ts
import { cacheSet, MAX_CACHE_ENTRIES } from '../state';

describe('cacheSet', () => {
  it('evicts the oldest entry past the cap', () => {
    let cache = new Map<string, GrammarIssue[]>();
    for (let i = 0; i < MAX_CACHE_ENTRIES + 10; i++) {
      cache = cacheSet(cache, `text-${i}`, []);
    }
    expect(cache.size).toBe(MAX_CACHE_ENTRIES);
    expect(cache.has('text-0')).toBe(false);
    expect(cache.has(`text-${MAX_CACHE_ENTRIES + 9}`)).toBe(true);
  });

  it('does not mutate the cache it is given', () => {
    const original = new Map<string, GrammarIssue[]>();
    const next = cacheSet(original, 'a', []);
    expect(original.size).toBe(0);
    expect(next.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run it**

```bash
pnpm --filter @inkwell/editor test -- grammar-check
```

Expected: PASS (both behaviors are already implemented by `cacheSet` in `state.ts`, written in **Task 3**). If either fails, fix `cacheSet` — these two properties are its contract.

- [ ] **Step 3: Add the `clearCache` meta**

In `packages/editor/src/extensions/grammar-check/index.ts`:

```ts
interface ClearCacheMeta {
  type: 'clearCache';
}

type GrammarMeta = ScanResultMeta | SetEnabledMeta | ClearCacheMeta;

/**
 * Empty the content-addressed cache. Dispatch after the user adds a word to
 * the dictionary or ignores an issue — the engine's answers changed, but the
 * cache is keyed by text, which did not.
 */
export function clearGrammarCache(): GrammarMeta {
  return { type: 'clearCache' };
}
```

And in `apply()`, before the `scanResult` branch:

```ts
            if (meta?.type === 'clearCache') {
              cache = new Map();
            } else if (meta?.type === 'scanResult') {
```

- [ ] **Step 4: Dispatch it from the popover**

In `apps/web/src/components/GrammarPopover.tsx`, import `clearGrammarCache` and call it at the end of both `onIgnore` and `onAddToDictionary`, before `close()`:

```ts
    editor.view.dispatch(editor.state.tr.setMeta(grammarCheckKey, clearGrammarCache()));
```

- [ ] **Step 5: Verify end-to-end**

```bash
pnpm --filter @inkwell/web dev
```

Type `Bbeierle wrote this.` → red squiggle under `Bbeierle`. Click it → "Add to dictionary". Expected: the squiggle disappears **and does not come back** — not on the next keystroke, not after a pause, and not after a page reload (the word is persisted in settings and replayed into the engine on mount).

- [ ] **Step 6: Commit**

```bash
git add packages/editor/src/extensions/grammar-check \
        apps/web/src/components/GrammarPopover.tsx
git commit -m "feat: invalidate the grammar cache when the dictionary or ignore-list changes"
```

---

### Task 10: Full verification

- [ ] **Step 1: Run everything**

```bash
cd "C:/Users/Bbeie/.gemini/antigravity/scratch/InkWell"
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all green. If `@inkwell/editor` coverage dropped below statements 95% / branches 90%, add tests for the uncovered branches — do not lower the threshold.

- [ ] **Step 2: Confirm the AI pipeline is untouched**

```bash
git diff main --stat -- packages/document-ai packages/shared
```

Expected: **empty.** If anything in `packages/document-ai` or `packages/shared` shows a diff attributable to this branch, it violates the Global Constraints — the local engine must not touch the AI pipeline. (Pre-existing uncommitted WIP in those paths is not part of this branch's diff and is fine.)

- [ ] **Step 3: Manual acceptance pass**

```bash
pnpm --filter @inkwell/web dev
```

| Check | Expected |
|---|---|
| Type `This sentance has an obvius typo.` | Two red wavy underlines after ~500ms. **Exactly one underline per word** (no native double-squiggle). |
| Type inside `sentance` | Its squiggle vanishes immediately; reappears after you pause. It **never** sits on the wrong word. |
| Toggle `Spell` off | Red squigglies vanish; blue grammar ones remain. |
| Toggle `Spell` back on | They return **instantly** — cache hit, no rescan, no flicker. |
| Ctrl+Z / Ctrl+Y rapidly | Squigglies track the text. No flicker, no drift, no stale anchors. |
| Click a squiggle → pick a suggestion | The correct word is replaced. Nothing else in the document changes. |
| Click a squiggle → "Add to dictionary" → reload the page | The word is still not flagged. |
| Disconnect from the network entirely | Spelling and grammar **still work**. (This is the whole point — it is local.) |
| `AI Proofread` on a selection | Still works exactly as before. |

- [ ] **Step 4: Push**

```bash
git push -u origin grammar-check
```
