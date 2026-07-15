import {
  LocalLinter,
  WorkerLinter,
  createBinaryModuleFromUrl,
  type Linter,
  type Lint,
} from 'harper.js';
import { binary } from 'harper.js/binary';
import { binaryInlined } from 'harper.js/binaryInlined';
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

  /**
   * `Lint`, `Span`, and `Suggestion` are wasm-bindgen handles backed by the
   * WASM heap. `check()` runs on every edit in a live as-you-type checker,
   * so we free each handle deterministically as soon as its data has been
   * copied out, rather than relying on the FinalizationRegistry (GC is
   * non-deterministic and lets WASM heap pressure build under rapid typing).
   *
   * Ordering is load-bearing: every value must be read out of a handle
   * *before* that handle is freed — freeing then reading is a
   * use-after-free. In particular, `contextHash` needs `lint` to still be
   * alive, so it's awaited before `lint.free()` runs.
   */
  private async toIssue(blockText: string, lint: Lint): Promise<GrammarIssue> {
    try {
      const span = lint.span();
      let offset: number;
      let length: number;
      try {
        offset = span.start;
        length = span.end - span.start;
      } finally {
        span.free();
      }

      const ruleKind = lint.lint_kind();
      const originalText = lint.get_problem_text();
      const message = lint.message();

      const suggestionHandles = lint.suggestions();
      let suggestions: string[];
      try {
        suggestions = suggestionHandles.map((s) => s.get_replacement_text());
      } finally {
        for (const s of suggestionHandles) s.free();
      }

      // Must be awaited while `lint` is still live — `lint.free()` runs in
      // the outer `finally` below, after this resolves.
      const hash = await this.linter.contextHash(blockText, lint);

      return {
        id: String(hash),
        kind: SPELLING_KINDS.has(ruleKind) ? 'spelling' : 'grammar',
        ruleKind,
        offset,
        length,
        originalText,
        message,
        suggestions,
      };
    } finally {
      lint.free();
    }
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

/**
 * Browser factory. Harper runs the WASM on its own Web Worker thread.
 *
 * `WorkerLinter`'s worker is created from a Blob (`URL.createObjectURL`), so it
 * runs in an opaque `blob:` origin with no base URL. harper's default `binary`
 * module resolves the `.wasm` via a ROOT-RELATIVE URL (e.g.
 * `/_next/static/media/harper_wasm_bg.<hash>.wasm` under a bundler). A blob
 * worker cannot fetch a root-relative URL — it has no base to resolve it
 * against — and `fetch()` throws "Failed to parse URL". The failure is silent:
 * `setup()` rejects, `check()` rejects, and callers that swallow scan errors
 * simply render no results.
 *
 * Fix: rebuild the binary module with an ABSOLUTE URL, resolved against the
 * page's own location, before handing it to the worker. This works for the web
 * build (http origin) and the Tauri webview (custom-protocol origin) alike,
 * with no bundle-size cost (unlike inlining the 24 MB base64 `binaryInlined`).
 */
export function createWorkerEngine(): GrammarEngine {
  const absoluteWasmUrl = toAbsoluteWasmUrl(String(binary.url), globalThis.location.href);
  const workerBinary = createBinaryModuleFromUrl(absoluteWasmUrl, 'full');
  return new GrammarEngine(new WorkerLinter({ binary: workerBinary }));
}

/**
 * Resolve harper's (possibly root-relative) WASM URL to an absolute URL against
 * the page location, so a blob-origin Web Worker can fetch it.
 *
 * Pure and exported for testing. An already-absolute URL passes through
 * unchanged; a root-relative one is anchored to the page origin.
 */
export function toAbsoluteWasmUrl(wasmUrl: string, pageHref: string): string {
  return new URL(wasmUrl, pageHref).href;
}

/**
 * Node/test factory. `WorkerLinter` does not work under Node.
 *
 * Uses `binaryInlined` (the WASM embedded as a base64 data: URL) rather than
 * the plain `binary` (a `file://` URL resolved from `import.meta.url`).
 * harper.js@2.4.0's Node loader reads `file://` binaries via
 * `fs.readFile(new URL(binary).pathname, ...)`, and on Windows `URL.pathname`
 * for a `file:///C:/...` URL is `/C:/...` (leading slash + drive letter),
 * which Node's `fs` mis-resolves relative to the current drive — producing a
 * doubled-drive path like `C:\C:\Users\...` and an ENOENT. The inlined data:
 * URL variant never touches the filesystem, so it sidesteps the bug
 * entirely. This only affects the Node/local factory; the browser factory
 * above loads over http(s) via a bundler and is unaffected.
 */
export function createLocalEngine(): GrammarEngine {
  return new GrammarEngine(new LocalLinter({ binary: binaryInlined }));
}
