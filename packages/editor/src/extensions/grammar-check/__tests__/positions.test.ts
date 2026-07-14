import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { schema } from 'prosemirror-test-builder';
import { Node as PMNode, Schema } from '@tiptap/pm/model';
import { textOffsetToPos } from '../positions';

/**
 * A schema with a non-leaf, non-text inline node ("widget") that carries its
 * own text content via children (unlike hard_break/image, which are leaf
 * nodes and therefore always contribute '' to textContent). This exercises
 * the defensive "offset lands inside a non-text node's interior" path,
 * which no node in prosemirror-test-builder's schema can reach.
 */
const widgetSchema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    widget: {
      inline: true,
      group: 'inline',
      content: 'text*',
      toDOM: () => ['span', 0] as const,
    },
  },
});

/** Build a doc with one paragraph from an alternating text / hardBreak spec. */
function buildDoc(parts: Array<string | 'BR'>): PMNode {
  const content = parts
    .filter((p) => p !== '')
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

    // Offset 1 is 'b' in textContent. Position walk: 0=before <p>, 1='a' starts,
    // 2='a' ends / <br> starts, 3='b' starts (the hard_break occupies position
    // 2..3), 4='b' ends. So offset 1 -> pos 3. (blockPos + 1 + offset = 0+1+1 = 2
    // is the naive/wrong answer, since it doesn't account for the hard_break's
    // own position slot.)
    const pos = textOffsetToPos(block, 0, 1)!;
    expect(doc.textBetween(pos, pos + 1)).toBe('b');
  });

  it('does not overshoot a TRAILING hard_break when the offset sits at the end of the text', () => {
    // REGRESSION (document corruption). <p>ab<br></p> — textContent is 'ab'.
    // Content positions: 'a'=[1,2), 'b'=[2,3), <br>=[3,4).
    //
    // The end-of-text fallback used to return `posCursor`, which the loop had
    // already advanced PAST the trailing hard_break — so offset 2 mapped to 4,
    // and an issue on the last character produced the range [2,4): 'b' PLUS the
    // break. A range replace over that range deletes the user's line break.
    const doc = buildDoc(['ab', 'BR']);
    const block = doc.child(0);
    expect(block.textContent).toBe('ab');

    const from = textOffsetToPos(block, 0, 1)!;
    const to = textOffsetToPos(block, 0, 2)!;

    expect(from).toBe(2);
    expect(to).toBe(3); // NOT 4 — the break must stay outside the range
    // Leaf-aware read: a leaf inside the range would render as U+FFFC.
    expect(doc.textBetween(from, to, undefined, '￼')).toBe('b');
  });

  it('still resolves the end offset AFTER an interior break when the block ends in text', () => {
    // The counterpart of the test above: <p>a<br>b</p>, textContent 'ab'. The
    // trailing-leaf fix must not regress the interior case — offset 2 is the end
    // of 'b', which lives after the break.
    const doc = buildDoc(['a', 'BR', 'b']);
    const block = doc.child(0);

    const from = textOffsetToPos(block, 0, 1)!;
    const to = textOffsetToPos(block, 0, 2)!;

    expect(from).toBe(3); // after the break
    expect(to).toBe(4);
    expect(doc.textBetween(from, to)).toBe('b');
  });

  it('maps the end offset of a block whose LAST child carries its own text', () => {
    // A trailing non-text node that DOES contribute characters must still be
    // walked past by the end-of-text fallback — the fix must skip only trailing
    // nodes that contribute nothing to textContent.
    const doc = widgetSchema.node('doc', null, [
      widgetSchema.node('paragraph', null, [
        widgetSchema.text('a'),
        widgetSchema.node('widget', null, [widgetSchema.text('x')]),
      ]),
    ]);
    const block = doc.child(0);
    expect(block.textContent).toBe('ax');

    const from = textOffsetToPos(block, 0, 0)!;
    const to = textOffsetToPos(block, 0, 2)!; // end of 'ax'

    expect(doc.textBetween(from, to)).toBe('ax');
  });

  it('returns null for an out-of-range offset', () => {
    const doc = buildDoc(['hi']);
    const block = doc.child(0);
    expect(textOffsetToPos(block, 0, 99)).toBeNull();
  });

  it('returns null for a negative offset', () => {
    const doc = buildDoc(['hi']);
    const block = doc.child(0);
    expect(textOffsetToPos(block, 0, -1)).toBeNull();
  });

  it('returns null when the offset lands inside a non-text node that carries its own text content', () => {
    // <p>a<widget>x</widget>b</p> — textContent is 'axb', but 'x' lives
    // inside the widget's own child text node, not the paragraph's direct
    // text children. There is no single position that addresses "partway
    // into" the widget's interior from the paragraph's point of view via
    // this offset-walking scheme, so it must be unaddressable.
    const doc = widgetSchema.node('doc', null, [
      widgetSchema.node('paragraph', null, [
        widgetSchema.text('a'),
        widgetSchema.node('widget', null, [widgetSchema.text('x')]),
        widgetSchema.text('b'),
      ]),
    ]);
    const block = doc.child(0);
    expect(block.textContent).toBe('axb');

    expect(textOffsetToPos(block, 0, 1)).toBeNull(); // 'x'
  });

  it('walks past a text-bearing non-text node to correctly address text after it', () => {
    const doc = widgetSchema.node('doc', null, [
      widgetSchema.node('paragraph', null, [
        widgetSchema.text('a'),
        widgetSchema.node('widget', null, [widgetSchema.text('x')]),
        widgetSchema.text('b'),
      ]),
    ]);
    const block = doc.child(0);

    const pos = textOffsetToPos(block, 0, 2)!; // 'b', after the widget
    expect(pos).not.toBeNull();
    expect(doc.textBetween(pos, pos + 1)).toBe('b');
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
