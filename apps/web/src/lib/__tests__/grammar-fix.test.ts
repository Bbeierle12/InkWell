import { describe, it, expect } from 'vitest';
import { EditorState } from '@tiptap/pm/state';
import { schema } from '@tiptap/pm/schema-basic';
import type { AnchoredIssue } from '@inkwell/editor';
import { applyFix } from '../grammar-fix';

/**
 * These are the load-bearing tests for the ONLY part of the grammar feature
 * that writes to the document. `applyFix` must re-verify the anchor immediately
 * before writing and REFUSE (return null, write nothing) on any mismatch.
 *
 * NOTE: `prosemirror-test-builder` is NOT resolvable from `apps/web` under this
 * pnpm workspace (it is a devDependency of `packages/editor` only). We build the
 * doc from `@tiptap/pm/schema-basic`, which IS resolvable and ships `paragraph`,
 * `text`, and `hard_break` — everything these tests need.
 */

/** A single-paragraph doc containing `text`. */
function stateWith(text: string) {
  return EditorState.create({
    doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]),
  });
}

/** A single paragraph: `left` + a hard_break + `right`. */
function stateWithBreak(left: string, right: string) {
  return EditorState.create({
    doc: schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text(left),
        schema.node('hard_break'),
        schema.text(right),
      ]),
    ]),
  });
}

/** Anchor `word` inside `text` at its natural position (+1 for the paragraph open token). */
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
  it('replaces the flagged text with the suggestion (happy path)', () => {
    const text = 'This sentance is bad.';
    const state = stateWith(text);
    const issue = issueOn(text, 'sentance', 'sentence');

    const tr = applyFix(state, issue, 'sentence');

    expect(tr).not.toBeNull();
    expect(tr!.doc.textContent).toBe('This sentence is bad.');
  });

  it('REFUSES (returns null) when the text at the range no longer matches (stale)', () => {
    // THE GUARANTEE (spec §5.4a). A stale squiggle that survived to a click must
    // never corrupt the document.
    const state = stateWith('Completely different text!');
    const issue = issueOn('This sentance is bad.', 'sentance', 'sentence');

    expect(applyFix(state, issue, 'sentence')).toBeNull();
  });

  it('REFUSES when the range is out of document bounds', () => {
    const state = stateWith('hi');
    const issue = {
      ...issueOn('This sentance is bad.', 'sentance', 'sentence'),
      from: 500,
      to: 900,
    };

    expect(applyFix(state, issue, 'sentence')).toBeNull();
  });

  it('REFUSES when from >= to (inverted / zero-length range)', () => {
    const text = 'This sentance is bad.';
    const state = stateWith(text);

    const zeroLength = { ...issueOn(text, 'sentance', 'sentence'), to: issueOn(text, 'sentance', 'sentence').from };
    expect(applyFix(state, zeroLength, 'sentence')).toBeNull();

    const inverted = { ...issueOn(text, 'sentance', 'sentence'), from: 10, to: 5 };
    expect(applyFix(state, inverted, 'sentence')).toBeNull();
  });

  it('REFUSES when from === to and originalText is empty (proves the from>=to guard rejects it, not the textBetween check)', () => {
    // An empty originalText at a zero-length range would spuriously PASS
    // textBetween(from, from, ...) === '' if the from>=to guard did not run
    // first. This isolates that the bounds guard — not the content check — is
    // what is actually rejecting the boundary case.
    const text = 'This sentance is bad.';
    const state = stateWith(text);
    const base = issueOn(text, 'sentance', 'sentence');
    const zeroLengthEmpty: AnchoredIssue = { ...base, to: base.from, originalText: '' };

    expect(applyFix(state, zeroLengthEmpty, 'sentence')).toBeNull();
  });

  it('REFUSES when from/to are non-finite or non-integer (NaN)', () => {
    const text = 'This sentance is bad.';
    const state = stateWith(text);
    const base = issueOn(text, 'sentance', 'sentence');

    expect(applyFix(state, { ...base, from: NaN }, 'sentence')).toBeNull();
    expect(applyFix(state, { ...base, to: NaN }, 'sentence')).toBeNull();
    expect(applyFix(state, { ...base, from: 1.5 }, 'sentence')).toBeNull();
  });

  it('REFUSES when the range would span a hard_break (leaf-aware verify)', () => {
    // Plain-text originalText, but the range straddles a hard_break in the doc.
    // A leaf-BLIND readback would render the break as '' and spuriously match;
    // the leaf-aware form must see the placeholder and refuse.
    const state = stateWithBreak('foo', 'bar');
    const issue: AnchoredIssue = {
      id: '1',
      kind: 'spelling',
      ruleKind: 'Spelling',
      offset: 0,
      length: 6,
      originalText: 'foobar', // NOT what the leaf-aware readback yields ("foo￼bar")
      message: '',
      suggestions: ['baz'],
      from: 1, // start of "foo"
      to: 8, // end of "bar", spanning the hard_break at pos 4
    };

    expect(applyFix(state, issue, 'baz')).toBeNull();
  });
});
