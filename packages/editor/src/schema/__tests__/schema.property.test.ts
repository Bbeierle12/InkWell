import { inkwellSchema } from '../index';
import { Node } from '@tiptap/pm/model';
import * as fc from 'fast-check';

/**
 * 1.1 Document Schema -- Property-based (fuzz) tests
 *
 * Uses fast-check to generate arbitrary valid documents and verify
 * schema invariants hold for all of them.
 *
 * Invariants covered:
 *   - schema-valid-after-operation
 *   - serialize-deserialize-stable
 */

// ===========================================================================
// Arbitrary generators for ProseMirror nodes in the Inkwell schema
// ===========================================================================

/** Generate a non-empty string suitable for text nodes. */
const arbTextContent = fc.string({ minLength: 1, maxLength: 200 });

/** Generate text content for code blocks (may be empty). */
const arbCodeContent = fc.string({ maxLength: 500 });

/** Generate a valid heading level 1-6. */
const arbHeadingLevel = fc.integer({ min: 1, max: 6 });

/** Generate image attributes. */
const arbImageAttrs = fc.record({
  src: fc.webUrl(),
  alt: fc.option(fc.string({ maxLength: 100 }), { nil: null }),
  title: fc.option(fc.string({ maxLength: 100 }), { nil: null }),
});

/** Generate link attributes. */
const arbLinkAttrs = fc.record({
  href: fc.webUrl(),
  title: fc.option(fc.string({ maxLength: 100 }), { nil: null }),
});

/** Generate an ordered_list start order. */
const arbListOrder = fc.integer({ min: 1, max: 1000 });

// ---------------------------------------------------------------------------
// Inline content generators (used inside paragraphs and headings)
// ---------------------------------------------------------------------------

/** Generate a single mark set to apply to a text node. */
const arbMarks = fc.subarray(
  ['bold', 'italic', 'underline', 'strikethrough', 'code'] as const,
  { minLength: 0, maxLength: 5 },
);

/** Generate a text node with optional marks. */
const arbTextNode: fc.Arbitrary<Node> = fc.tuple(arbTextContent, arbMarks).map(
  ([text, markNames]) => {
    const marks = markNames.map((name) => inkwellSchema.marks[name].create());
    return inkwellSchema.text(text, marks);
  },
);

/** Generate a text node with a link mark. */
const arbLinkedText: fc.Arbitrary<Node> = fc
  .tuple(arbTextContent, arbLinkAttrs)
  .map(([text, attrs]) => {
    const linkMark = inkwellSchema.marks.link.create(attrs);
    return inkwellSchema.text(text, [linkMark]);
  });

/** Generate a hard_break node. */
const arbHardBreak: fc.Arbitrary<Node> = fc.constant(
  inkwellSchema.node('hard_break'),
);

/** Generate an image node. */
const arbImage: fc.Arbitrary<Node> = arbImageAttrs.map((attrs) =>
  inkwellSchema.node('image', attrs),
);

/** Generate an array of inline content (for paragraph or heading). */
const arbInlineContent: fc.Arbitrary<Node[]> = fc
  .array(
    fc.oneof(
      { weight: 5, arbitrary: arbTextNode },
      { weight: 1, arbitrary: arbLinkedText },
      { weight: 1, arbitrary: arbHardBreak },
      { weight: 1, arbitrary: arbImage },
    ),
    { minLength: 0, maxLength: 8 },
  );

// ---------------------------------------------------------------------------
// Block content generators
// ---------------------------------------------------------------------------

/** Generate a paragraph node. */
const arbParagraph: fc.Arbitrary<Node> = arbInlineContent.map((children) =>
  inkwellSchema.node('paragraph', null, children),
);

/** Generate a heading node with random level. */
const arbHeading: fc.Arbitrary<Node> = fc
  .tuple(arbHeadingLevel, arbInlineContent)
  .map(([level, children]) =>
    inkwellSchema.node('heading', { level }, children),
  );

/** Generate a code_block node (text only, no marks). */
const arbCodeBlock: fc.Arbitrary<Node> = arbCodeContent.map((text) => {
  const children = text.length > 0 ? [inkwellSchema.text(text)] : [];
  return inkwellSchema.node('code_block', null, children);
});

/** Generate a horizontal_rule node. */
const arbHorizontalRule: fc.Arbitrary<Node> = fc.constant(
  inkwellSchema.node('horizontal_rule'),
);

/**
 * Generate a simple block node (no recursive nesting).
 * Used as leaves in recursive structures.
 */
const arbSimpleBlock: fc.Arbitrary<Node> = fc.oneof(
  { weight: 4, arbitrary: arbParagraph },
  { weight: 2, arbitrary: arbHeading },
  { weight: 2, arbitrary: arbCodeBlock },
  { weight: 1, arbitrary: arbHorizontalRule },
);

/** Generate a list_item node: requires paragraph first, then zero or more blocks. */
const arbListItem: fc.Arbitrary<Node> = fc
  .tuple(
    arbParagraph,
    fc.array(arbSimpleBlock, { minLength: 0, maxLength: 2 }),
  )
  .map(([para, extraBlocks]) =>
    inkwellSchema.node('list_item', null, [para, ...extraBlocks]),
  );

/** Generate a bullet_list node with 1-5 list items. */
const arbBulletList: fc.Arbitrary<Node> = fc
  .array(arbListItem, { minLength: 1, maxLength: 5 })
  .map((items) => inkwellSchema.node('bullet_list', null, items));

/** Generate an ordered_list node with 1-5 list items and optional start order. */
const arbOrderedList: fc.Arbitrary<Node> = fc
  .tuple(
    arbListOrder,
    fc.array(arbListItem, { minLength: 1, maxLength: 5 }),
  )
  .map(([order, items]) =>
    inkwellSchema.node('ordered_list', { order }, items),
  );

/** Generate a blockquote with 1-3 simple blocks. */
const arbBlockquote: fc.Arbitrary<Node> = fc
  .array(arbSimpleBlock, { minLength: 1, maxLength: 3 })
  .chain((blocks) => {
    // Ensure at least one non-empty block exists (blockquote requires block+).
    // Filter out anything unexpected (shouldn't happen, but be safe).
    if (blocks.length === 0) {
      return fc.constant(
        inkwellSchema.node('blockquote', null, [
          inkwellSchema.node('paragraph', null, []),
        ]),
      );
    }
    return fc.constant(inkwellSchema.node('blockquote', null, blocks));
  });

/**
 * Generate any block-level node including lists and blockquotes.
 * This is the top-level block generator used for document construction.
 */
const arbBlock: fc.Arbitrary<Node> = fc.oneof(
  { weight: 4, arbitrary: arbParagraph },
  { weight: 2, arbitrary: arbHeading },
  { weight: 2, arbitrary: arbCodeBlock },
  { weight: 1, arbitrary: arbHorizontalRule },
  { weight: 2, arbitrary: arbBulletList },
  { weight: 2, arbitrary: arbOrderedList },
  { weight: 2, arbitrary: arbBlockquote },
);

/**
 * Generate a valid document node.
 * doc content = block+, so we need at least one block child.
 */
const arbDocument: fc.Arbitrary<Node> = fc
  .array(arbBlock, { minLength: 1, maxLength: 10 })
  .map((blocks) => inkwellSchema.node('doc', null, blocks));

// ===========================================================================
// TEST SUITE
// ===========================================================================

describe('1.1 Document Schema -- Property Tests', () => {
  // -------------------------------------------------------------------------
  // Invariant: schema-valid-after-operation
  // -------------------------------------------------------------------------
  describe('Schema invariant sweep', () => {
    it('should always produce schema-valid documents from arbitrary content', () => {
      fc.assert(
        fc.property(arbDocument, (document) => {
          // .check() throws RangeError if the document violates schema constraints.
          // If this does not throw, the document is valid.
          document.check();
        }),
        { numRuns: 10_000 },
      );
    });

    it('should always produce valid paragraphs from arbitrary inline content', () => {
      fc.assert(
        fc.property(arbParagraph, (para) => {
          para.check();
          expect(para.type.name).toBe('paragraph');
        }),
        { numRuns: 2_000 },
      );
    });

    it('should always produce valid headings from arbitrary inline content', () => {
      fc.assert(
        fc.property(arbHeading, (heading) => {
          heading.check();
          expect(heading.type.name).toBe('heading');
          expect(heading.attrs.level).toBeGreaterThanOrEqual(1);
          expect(heading.attrs.level).toBeLessThanOrEqual(6);
        }),
        { numRuns: 2_000 },
      );
    });

    it('should always produce valid code_blocks from arbitrary text', () => {
      fc.assert(
        fc.property(arbCodeBlock, (cb) => {
          cb.check();
          expect(cb.type.name).toBe('code_block');
          // Code blocks must never have marks on their text children
          cb.forEach((child) => {
            expect(child.marks.length).toBe(0);
          });
        }),
        { numRuns: 2_000 },
      );
    });

    it('should always produce valid list_items from arbitrary content', () => {
      fc.assert(
        fc.property(arbListItem, (li) => {
          li.check();
          expect(li.type.name).toBe('list_item');
          // First child must always be a paragraph
          expect(li.firstChild!.type.name).toBe('paragraph');
        }),
        { numRuns: 2_000 },
      );
    });

    it('should always produce valid bullet_lists', () => {
      fc.assert(
        fc.property(arbBulletList, (ul) => {
          ul.check();
          expect(ul.type.name).toBe('bullet_list');
          expect(ul.childCount).toBeGreaterThanOrEqual(1);
          // Every child must be a list_item
          ul.forEach((child) => {
            expect(child.type.name).toBe('list_item');
          });
        }),
        { numRuns: 1_000 },
      );
    });

    it('should always produce valid ordered_lists', () => {
      fc.assert(
        fc.property(arbOrderedList, (ol) => {
          ol.check();
          expect(ol.type.name).toBe('ordered_list');
          expect(ol.childCount).toBeGreaterThanOrEqual(1);
          expect(ol.attrs.order).toBeGreaterThanOrEqual(1);
          ol.forEach((child) => {
            expect(child.type.name).toBe('list_item');
          });
        }),
        { numRuns: 1_000 },
      );
    });

    it('should always produce valid blockquotes', () => {
      fc.assert(
        fc.property(arbBlockquote, (bq) => {
          bq.check();
          expect(bq.type.name).toBe('blockquote');
          expect(bq.childCount).toBeGreaterThanOrEqual(1);
        }),
        { numRuns: 1_000 },
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invariant: serialize-deserialize-stable
  // -------------------------------------------------------------------------
  describe('Serialize-deserialize stability', () => {
    it('should maintain JSON round-trip equality for arbitrary documents', () => {
      fc.assert(
        fc.property(arbDocument, (document) => {
          const json = document.toJSON();
          const restored = Node.fromJSON(inkwellSchema, json);
          expect(document.eq(restored)).toBe(true);
        }),
        { numRuns: 10_000 },
      );
    });

    it('should maintain JSON round-trip for arbitrary paragraphs', () => {
      fc.assert(
        fc.property(arbParagraph, (para) => {
          const json = para.toJSON();
          const restored = Node.fromJSON(inkwellSchema, json);
          expect(para.eq(restored)).toBe(true);
        }),
        { numRuns: 2_000 },
      );
    });

    it('should maintain JSON round-trip for arbitrary headings', () => {
      fc.assert(
        fc.property(arbHeading, (heading) => {
          const json = heading.toJSON();
          const restored = Node.fromJSON(inkwellSchema, json);
          expect(heading.eq(restored)).toBe(true);
        }),
        { numRuns: 2_000 },
      );
    });

    it('should maintain JSON round-trip through string serialization', () => {
      // Ensure the JSON is genuinely serializable (no circular refs, etc.)
      fc.assert(
        fc.property(arbDocument, (document) => {
          const jsonStr = JSON.stringify(document.toJSON());
          const parsed = JSON.parse(jsonStr);
          const restored = Node.fromJSON(inkwellSchema, parsed);
          expect(document.eq(restored)).toBe(true);
        }),
        { numRuns: 5_000 },
      );
    });

    it('should preserve node type across serialization', () => {
      fc.assert(
        fc.property(arbDocument, (document) => {
          const json = document.toJSON();
          const restored = Node.fromJSON(inkwellSchema, json);

          // Walk both trees and compare node types at each position
          const origTypes: string[] = [];
          const restoredTypes: string[] = [];

          document.descendants((node) => {
            origTypes.push(node.type.name);
            return true;
          });
          restored.descendants((node) => {
            restoredTypes.push(node.type.name);
            return true;
          });

          expect(origTypes).toEqual(restoredTypes);
        }),
        { numRuns: 5_000 },
      );
    });

    it('should preserve marks across serialization', () => {
      fc.assert(
        fc.property(arbDocument, (document) => {
          const json = document.toJSON();
          const restored = Node.fromJSON(inkwellSchema, json);

          // Collect all mark sets from text nodes
          const origMarks: string[][] = [];
          const restoredMarks: string[][] = [];

          document.descendants((node) => {
            if (node.isText) {
              origMarks.push(node.marks.map((m) => m.type.name).sort());
            }
            return true;
          });
          restored.descendants((node) => {
            if (node.isText) {
              restoredMarks.push(node.marks.map((m) => m.type.name).sort());
            }
            return true;
          });

          expect(origMarks).toEqual(restoredMarks);
        }),
        { numRuns: 5_000 },
      );
    });

    it('should preserve attributes across serialization', () => {
      fc.assert(
        fc.property(arbDocument, (document) => {
          const json = document.toJSON();
          const restored = Node.fromJSON(inkwellSchema, json);

          // Collect all node attrs
          const origAttrs: Array<{ type: string; attrs: Record<string, unknown> }> = [];
          const restoredAttrs: Array<{ type: string; attrs: Record<string, unknown> }> = [];

          document.descendants((node) => {
            if (Object.keys(node.attrs).length > 0) {
              origAttrs.push({ type: node.type.name, attrs: { ...node.attrs } });
            }
            return true;
          });
          restored.descendants((node) => {
            if (Object.keys(node.attrs).length > 0) {
              restoredAttrs.push({ type: node.type.name, attrs: { ...node.attrs } });
            }
            return true;
          });

          expect(origAttrs).toEqual(restoredAttrs);
        }),
        { numRuns: 5_000 },
      );
    });
  });
});
