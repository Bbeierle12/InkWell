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
