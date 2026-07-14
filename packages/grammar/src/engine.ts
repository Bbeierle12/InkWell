import { LocalLinter, WorkerLinter, type Linter, type Lint } from 'harper.js';
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
