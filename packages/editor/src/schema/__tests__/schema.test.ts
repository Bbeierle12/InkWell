import { inkwellSchema, nodes, marks } from '../index';
import { Node, DOMSerializer, DOMParser } from '@tiptap/pm/model';
import { builders } from 'prosemirror-test-builder';

/**
 * 1.1 Document Schema Validation
 *
 * Verifies the Inkwell ProseMirror schema is correctly defined and produces
 * valid documents for all supported node and mark types.
 *
 * Invariants covered:
 *   - schema-valid-after-operation
 *   - serialize-deserialize-stable
 */

// ---------------------------------------------------------------------------
// Build helpers from the Inkwell schema.
// prosemirror-test-builder generates a builder for each node/mark type name.
// We also set up convenience aliases for heading levels.
// ---------------------------------------------------------------------------
const b = builders(inkwellSchema, {
  h1: { nodeType: 'heading', level: 1 },
  h2: { nodeType: 'heading', level: 2 },
  h3: { nodeType: 'heading', level: 3 },
  h4: { nodeType: 'heading', level: 4 },
  h5: { nodeType: 'heading', level: 5 },
  h6: { nodeType: 'heading', level: 6 },
});

// Extract builder functions. When the names match the node/mark name exactly
// the builders function creates them automatically. We also pull in the aliases.
const {
  doc,
  paragraph,
  heading,
  blockquote,
  code_block,
  horizontal_rule,
  bullet_list,
  ordered_list,
  list_item,
  hard_break,
  image,
  bold,
  italic,
  underline,
  strikethrough,
  code,
  link,
  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
} = b as any; // cast — the Builders type is generic

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shortcut: create a text node in the schema. */
const text = (t: string) => inkwellSchema.text(t);

/** Validate a node against the schema — returns true if valid, false if not. */
function isValid(node: Node): boolean {
  try {
    node.check();
    return true;
  } catch {
    return false;
  }
}

// ===========================================================================
// TEST SUITE
// ===========================================================================

describe('1.1 Document Schema Validation', () => {
  // -------------------------------------------------------------------------
  // 7. All required node types present
  // -------------------------------------------------------------------------
  describe('All required node types present', () => {
    const expectedNodes = [
      'doc',
      'paragraph',
      'heading',
      'blockquote',
      'code_block',
      'horizontal_rule',
      'bullet_list',
      'ordered_list',
      'list_item',
      'text',
      'hard_break',
      'image',
    ];

    it('should contain exactly the 12 expected node types', () => {
      const schemaNodeNames = Object.keys(inkwellSchema.nodes);
      for (const name of expectedNodes) {
        expect(schemaNodeNames).toContain(name);
      }
      expect(schemaNodeNames).toHaveLength(expectedNodes.length);
    });

    it.each(expectedNodes)('should have node type "%s"', (name) => {
      expect(inkwellSchema.nodes[name]).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 8. All required mark types present
  // -------------------------------------------------------------------------
  describe('All required mark types present', () => {
    const expectedMarks = [
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'code',
      'link',
    ];

    it('should contain exactly the 6 expected mark types', () => {
      const schemaMarkNames = Object.keys(inkwellSchema.marks);
      for (const name of expectedMarks) {
        expect(schemaMarkNames).toContain(name);
      }
      expect(schemaMarkNames).toHaveLength(expectedMarks.length);
    });

    it.each(expectedMarks)('should have mark type "%s"', (name) => {
      expect(inkwellSchema.marks[name]).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 1. Valid node nesting — legal and illegal positions
  // -------------------------------------------------------------------------
  describe('Valid node nesting', () => {
    // --- Legal nestings ---

    it('should allow paragraph inside doc', () => {
      const d = doc(paragraph('hello'));
      expect(isValid(d)).toBe(true);
    });

    it('should allow heading inside doc', () => {
      const d = doc(h1('Title'));
      expect(isValid(d)).toBe(true);
    });

    it('should allow blockquote containing paragraphs inside doc', () => {
      const d = doc(blockquote(paragraph('quoted text')));
      expect(isValid(d)).toBe(true);
    });

    it('should allow nested blockquotes', () => {
      const d = doc(blockquote(blockquote(paragraph('deeply quoted'))));
      expect(isValid(d)).toBe(true);
    });

    it('should allow code_block inside doc', () => {
      const d = doc(code_block('const x = 1;'));
      expect(isValid(d)).toBe(true);
    });

    it('should allow horizontal_rule inside doc', () => {
      const d = doc(paragraph('before'), horizontal_rule(), paragraph('after'));
      expect(isValid(d)).toBe(true);
    });

    it('should allow bullet_list with list_items inside doc', () => {
      const d = doc(
        bullet_list(
          list_item(paragraph('item 1')),
          list_item(paragraph('item 2')),
        ),
      );
      expect(isValid(d)).toBe(true);
    });

    it('should allow ordered_list with list_items inside doc', () => {
      const d = doc(
        ordered_list(
          list_item(paragraph('first')),
          list_item(paragraph('second')),
        ),
      );
      expect(isValid(d)).toBe(true);
    });

    it('should allow nested lists inside list_item', () => {
      // list_item content = 'paragraph block*', so after paragraph we can have another list
      const d = doc(
        bullet_list(
          list_item(
            paragraph('parent'),
            bullet_list(
              list_item(paragraph('child')),
            ),
          ),
        ),
      );
      expect(isValid(d)).toBe(true);
    });

    it('should allow hard_break inline in paragraph', () => {
      const d = doc(paragraph('line 1', hard_break(), 'line 2'));
      expect(isValid(d)).toBe(true);
    });

    it('should allow image inline in paragraph', () => {
      const d = doc(
        paragraph(
          'text before ',
          image({ src: 'https://example.com/img.png' }),
          ' text after',
        ),
      );
      expect(isValid(d)).toBe(true);
    });

    it('should allow blockquote containing heading', () => {
      const d = doc(blockquote(h2('Quoted heading')));
      expect(isValid(d)).toBe(true);
    });

    it('should allow multiple block types mixed in doc', () => {
      const d = doc(
        h1('Title'),
        paragraph('Intro paragraph'),
        blockquote(paragraph('A quote')),
        code_block('some code'),
        horizontal_rule(),
        bullet_list(list_item(paragraph('item'))),
        ordered_list(list_item(paragraph('numbered'))),
        paragraph('Conclusion'),
      );
      expect(isValid(d)).toBe(true);
    });

    // --- Illegal nestings ---

    it('should reject inline content directly in doc', () => {
      // doc requires block+ content, not inline
      expect(() => {
        const d = inkwellSchema.node('doc', null, [text('bare text')]);
        d.check();
      }).toThrow(RangeError);
    });

    it('should reject a paragraph inside a paragraph', () => {
      // paragraph content = inline*, so block children are invalid
      expect(() => {
        const inner = inkwellSchema.node('paragraph', null, [text('inner')]);
        const outer = inkwellSchema.node('paragraph', null, [inner]);
        outer.check();
      }).toThrow(RangeError);
    });

    it('should reject heading inside a paragraph', () => {
      expect(() => {
        const h = inkwellSchema.node('heading', { level: 1 }, [text('title')]);
        const p = inkwellSchema.node('paragraph', null, [h]);
        p.check();
      }).toThrow(RangeError);
    });

    it('should reject block content inside code_block', () => {
      // code_block content = text*, so paragraph children are invalid
      expect(() => {
        const para = inkwellSchema.node('paragraph', null, [text('oops')]);
        const cb = inkwellSchema.node('code_block', null, [para]);
        cb.check();
      }).toThrow(RangeError);
    });

    it('should reject content inside horizontal_rule', () => {
      // horizontal_rule has no content spec — it is a leaf node
      expect(() => {
        const hr = inkwellSchema.node('horizontal_rule', null, [text('oops')]);
        hr.check();
      }).toThrow(RangeError);
    });

    it('should reject list_item directly in doc (must be inside list)', () => {
      // list_item is not in the 'block' group, and doc requires block+ content
      expect(() => {
        const li = inkwellSchema.node('list_item', null, [
          inkwellSchema.node('paragraph', null, [text('item')]),
        ]);
        const d = inkwellSchema.node('doc', null, [li]);
        d.check();
      }).toThrow(RangeError);
    });

    it('should reject empty blockquote (requires block+)', () => {
      expect(() => {
        const bq = inkwellSchema.node('blockquote', null, []);
        bq.check();
      }).toThrow(RangeError);
    });

    it('should reject paragraph directly inside bullet_list (requires list_item+)', () => {
      expect(() => {
        const para = inkwellSchema.node('paragraph', null, [text('not a list item')]);
        const ul = inkwellSchema.node('bullet_list', null, [para]);
        ul.check();
      }).toThrow(RangeError);
    });

    it('should reject list_item without leading paragraph', () => {
      // list_item content = 'paragraph block*', so must start with paragraph
      expect(() => {
        const heading = inkwellSchema.node('heading', { level: 1 }, [text('heading first')]);
        const li = inkwellSchema.node('list_item', null, [heading]);
        li.check();
      }).toThrow(RangeError);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Mark application rules
  // -------------------------------------------------------------------------
  describe('Mark application rules', () => {
    it('should allow bold mark on text inside paragraph', () => {
      const d = doc(paragraph(bold('bold text')));
      expect(isValid(d)).toBe(true);
      // Verify the text node actually carries the bold mark
      const textNode = d.firstChild!.firstChild!;
      expect(textNode.marks.length).toBe(1);
      expect(textNode.marks[0].type.name).toBe('bold');
    });

    it('should allow italic mark on text inside paragraph', () => {
      const d = doc(paragraph(italic('italic text')));
      expect(isValid(d)).toBe(true);
      const textNode = d.firstChild!.firstChild!;
      expect(textNode.marks[0].type.name).toBe('italic');
    });

    it('should allow underline mark on text inside paragraph', () => {
      const d = doc(paragraph(underline('underlined')));
      expect(isValid(d)).toBe(true);
    });

    it('should allow strikethrough mark on text inside paragraph', () => {
      const d = doc(paragraph(strikethrough('struck')));
      expect(isValid(d)).toBe(true);
    });

    it('should allow code mark on text inside paragraph', () => {
      const d = doc(paragraph(code('inline code')));
      expect(isValid(d)).toBe(true);
    });

    it('should allow link mark on text inside paragraph', () => {
      const d = doc(paragraph(link({ href: 'https://example.com' }, 'click me')));
      expect(isValid(d)).toBe(true);
      const textNode = d.firstChild!.firstChild!;
      expect(textNode.marks[0].type.name).toBe('link');
      expect(textNode.marks[0].attrs.href).toBe('https://example.com');
    });

    it('should allow multiple marks on the same text', () => {
      const d = doc(paragraph(bold(italic('bold and italic'))));
      expect(isValid(d)).toBe(true);
      const textNode = d.firstChild!.firstChild!;
      const markNames = textNode.marks.map((m: any) => m.type.name);
      expect(markNames).toContain('bold');
      expect(markNames).toContain('italic');
    });

    it('should allow marks inside heading', () => {
      const d = doc(h1(bold('Bold heading')));
      expect(isValid(d)).toBe(true);
    });

    it('should allow marks inside blockquote paragraphs', () => {
      const d = doc(blockquote(paragraph(italic('quoted italic'))));
      expect(isValid(d)).toBe(true);
    });

    it('should allow marks inside list_item paragraphs', () => {
      const d = doc(
        bullet_list(
          list_item(paragraph(bold('bold list item'))),
        ),
      );
      expect(isValid(d)).toBe(true);
    });

    it('should reject marked text inside code_block (marks: "")', () => {
      // code_block has marks: '' which means no marks are allowed.
      // ProseMirror's schema.node() uses createChecked internally, which
      // rejects content with disallowed marks at creation time.
      const boldMark = inkwellSchema.marks.bold.create();
      const markedText = inkwellSchema.text('should not be bold', [boldMark]);

      expect(() => {
        inkwellSchema.node('code_block', null, [markedText]);
      }).toThrow(RangeError);
    });

    it('should allow unmarked text inside code_block', () => {
      const cb = inkwellSchema.node('code_block', null, [text('plain code')]);
      expect(isValid(cb)).toBe(true);
      expect(cb.firstChild!.marks.length).toBe(0);
    });

    it('should not have marks on horizontal_rule (leaf node)', () => {
      const hr = inkwellSchema.node('horizontal_rule');
      expect(hr.marks.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Empty document integrity
  // -------------------------------------------------------------------------
  describe('Empty document integrity', () => {
    // Invariant: serialize-deserialize-stable

    it('should create a valid empty document (doc with single empty paragraph)', () => {
      const emptyDoc = doc(paragraph());
      expect(isValid(emptyDoc)).toBe(true);
      expect(emptyDoc.type.name).toBe('doc');
      expect(emptyDoc.childCount).toBe(1);
      expect(emptyDoc.firstChild!.type.name).toBe('paragraph');
      expect(emptyDoc.firstChild!.childCount).toBe(0);
    });

    it('should survive JSON serialize -> deserialize', () => {
      const emptyDoc = doc(paragraph());
      const json = emptyDoc.toJSON();
      const restored = Node.fromJSON(inkwellSchema, json);
      expect(emptyDoc.eq(restored)).toBe(true);
    });

    it('should survive HTML serialize -> deserialize (DOM round-trip)', () => {
      const emptyDoc = doc(paragraph());

      const serializer = DOMSerializer.fromSchema(inkwellSchema);
      const parser = DOMParser.fromSchema(inkwellSchema);

      // Serialize to DOM fragment
      const domFragment = serializer.serializeFragment(emptyDoc.content);

      // Wrap in a container to parse back
      const container = document.createElement('div');
      container.appendChild(domFragment);

      // Parse back from DOM
      const restored = parser.parse(container);

      expect(emptyDoc.eq(restored)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Max depth / content rules
  // -------------------------------------------------------------------------
  describe('Content rules enforcement', () => {
    it('doc requires block+ content (cannot be empty)', () => {
      expect(() => {
        const d = inkwellSchema.node('doc', null, []);
        d.check();
      }).toThrow(RangeError);
    });

    it('paragraph accepts inline* (can be empty)', () => {
      const p = inkwellSchema.node('paragraph', null, []);
      expect(isValid(p)).toBe(true);
    });

    it('paragraph accepts inline* (can have text)', () => {
      const p = inkwellSchema.node('paragraph', null, [text('hello')]);
      expect(isValid(p)).toBe(true);
    });

    it('paragraph accepts inline* (can have mixed inline content)', () => {
      const d = doc(paragraph('text', hard_break(), 'more text'));
      expect(isValid(d)).toBe(true);
    });

    it('heading accepts inline* (can be empty)', () => {
      const h = inkwellSchema.node('heading', { level: 1 }, []);
      expect(isValid(h)).toBe(true);
    });

    it('heading accepts inline* (can have text)', () => {
      const h = inkwellSchema.node('heading', { level: 1 }, [text('Title')]);
      expect(isValid(h)).toBe(true);
    });

    it('blockquote requires block+ (cannot be empty)', () => {
      expect(() => {
        const bq = inkwellSchema.node('blockquote', null, []);
        bq.check();
      }).toThrow(RangeError);
    });

    it('code_block accepts text* (can be empty)', () => {
      const cb = inkwellSchema.node('code_block', null, []);
      expect(isValid(cb)).toBe(true);
    });

    it('code_block accepts text* (can have text)', () => {
      const cb = inkwellSchema.node('code_block', null, [text('code')]);
      expect(isValid(cb)).toBe(true);
    });

    it('bullet_list requires list_item+ (cannot be empty)', () => {
      expect(() => {
        const ul = inkwellSchema.node('bullet_list', null, []);
        ul.check();
      }).toThrow(RangeError);
    });

    it('ordered_list requires list_item+ (cannot be empty)', () => {
      expect(() => {
        const ol = inkwellSchema.node('ordered_list', null, []);
        ol.check();
      }).toThrow(RangeError);
    });

    it('list_item requires paragraph first (content: paragraph block*)', () => {
      // Valid: starts with paragraph
      const validLi = inkwellSchema.node('list_item', null, [
        inkwellSchema.node('paragraph', null, [text('item')]),
      ]);
      expect(isValid(validLi)).toBe(true);

      // Invalid: starts with heading instead of paragraph
      expect(() => {
        const invalidLi = inkwellSchema.node('list_item', null, [
          inkwellSchema.node('heading', { level: 1 }, [text('not allowed')]),
        ]);
        invalidLi.check();
      }).toThrow(RangeError);
    });

    it('list_item can have additional block content after paragraph', () => {
      const li = inkwellSchema.node('list_item', null, [
        inkwellSchema.node('paragraph', null, [text('intro')]),
        inkwellSchema.node('paragraph', null, [text('more')]),
        inkwellSchema.node('code_block', null, [text('code')]),
      ]);
      expect(isValid(li)).toBe(true);
    });

    it('horizontal_rule is a leaf node (no content)', () => {
      const hr = inkwellSchema.node('horizontal_rule');
      expect(hr.childCount).toBe(0);
      expect(isValid(hr)).toBe(true);
    });

    it('hard_break is a leaf node (no content)', () => {
      const hb = inkwellSchema.node('hard_break');
      expect(hb.childCount).toBe(0);
      expect(isValid(hb)).toBe(true);
    });

    it('image is a leaf node (no content)', () => {
      const img = inkwellSchema.node('image', { src: 'x.png' });
      expect(img.childCount).toBe(0);
      expect(isValid(img)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Custom node validation — individual node types
  // -------------------------------------------------------------------------
  describe('Custom node validation', () => {
    describe('heading', () => {
      it('should default level to 1', () => {
        const h = inkwellSchema.node('heading', null, [text('Default')]);
        expect(h.attrs.level).toBe(1);
      });

      it.each([1, 2, 3, 4, 5, 6])('should accept level %i', (level) => {
        const h = inkwellSchema.node('heading', { level }, [text(`H${level}`)]);
        expect(isValid(h)).toBe(true);
        expect(h.attrs.level).toBe(level);
      });

      it('should accept heading levels via builder aliases', () => {
        const d = doc(h1('H1'), h2('H2'), h3('H3'), h4('H4'), h5('H5'), h6('H6'));
        expect(isValid(d)).toBe(true);

        const children: Node[] = [];
        d.forEach((child: Node) => children.push(child));
        expect(children[0].attrs.level).toBe(1);
        expect(children[1].attrs.level).toBe(2);
        expect(children[2].attrs.level).toBe(3);
        expect(children[3].attrs.level).toBe(4);
        expect(children[4].attrs.level).toBe(5);
        expect(children[5].attrs.level).toBe(6);
      });
    });

    describe('image', () => {
      it('should require src attribute', () => {
        // image has src: {} (no default) so creating without src should throw
        expect(() => {
          inkwellSchema.node('image', {});
        }).toThrow();
      });

      it('should default alt and title to null', () => {
        const img = inkwellSchema.node('image', { src: 'test.png' });
        expect(img.attrs.src).toBe('test.png');
        expect(img.attrs.alt).toBeNull();
        expect(img.attrs.title).toBeNull();
      });

      it('should accept all attrs (src, alt, title)', () => {
        const img = inkwellSchema.node('image', {
          src: 'photo.jpg',
          alt: 'A photo',
          title: 'My photo',
        });
        expect(img.attrs.src).toBe('photo.jpg');
        expect(img.attrs.alt).toBe('A photo');
        expect(img.attrs.title).toBe('My photo');
      });

      it('should be inline', () => {
        expect(inkwellSchema.nodes.image.spec.inline).toBe(true);
      });
    });

    describe('ordered_list', () => {
      it('should default order attr to 1', () => {
        const ol = inkwellSchema.node('ordered_list', null, [
          inkwellSchema.node('list_item', null, [
            inkwellSchema.node('paragraph', null, [text('item')]),
          ]),
        ]);
        expect(ol.attrs.order).toBe(1);
      });

      it('should accept custom order attr', () => {
        const ol = inkwellSchema.node('ordered_list', { order: 5 }, [
          inkwellSchema.node('list_item', null, [
            inkwellSchema.node('paragraph', null, [text('item')]),
          ]),
        ]);
        expect(ol.attrs.order).toBe(5);
      });
    });

    describe('link mark', () => {
      it('should require href attribute', () => {
        expect(() => {
          inkwellSchema.marks.link.create({});
        }).toThrow();
      });

      it('should default title to null', () => {
        const linkMark = inkwellSchema.marks.link.create({ href: 'https://example.com' });
        expect(linkMark.attrs.href).toBe('https://example.com');
        expect(linkMark.attrs.title).toBeNull();
      });

      it('should accept title attribute', () => {
        const linkMark = inkwellSchema.marks.link.create({
          href: 'https://example.com',
          title: 'Example',
        });
        expect(linkMark.attrs.title).toBe('Example');
      });

      it('should not be inclusive', () => {
        expect(inkwellSchema.marks.link.spec.inclusive).toBe(false);
      });
    });

    describe('code_block', () => {
      it('should have code: true in spec', () => {
        expect(inkwellSchema.nodes.code_block.spec.code).toBe(true);
      });

      it('should disallow marks (marks: "")', () => {
        expect(inkwellSchema.nodes.code_block.spec.marks).toBe('');
      });
    });

    describe('node groups', () => {
      it('paragraph should be in block group', () => {
        expect(nodes.paragraph.group).toBe('block');
      });

      it('heading should be in block group', () => {
        expect(nodes.heading.group).toBe('block');
      });

      it('blockquote should be in block group', () => {
        expect(nodes.blockquote.group).toBe('block');
      });

      it('code_block should be in block group', () => {
        expect(nodes.code_block.group).toBe('block');
      });

      it('horizontal_rule should be in block group', () => {
        expect(nodes.horizontal_rule.group).toBe('block');
      });

      it('bullet_list should be in block group', () => {
        expect(nodes.bullet_list.group).toBe('block');
      });

      it('ordered_list should be in block group', () => {
        expect(nodes.ordered_list.group).toBe('block');
      });

      it('text should be in inline group', () => {
        expect(nodes.text.group).toBe('inline');
      });

      it('hard_break should be in inline group', () => {
        expect(nodes.hard_break.group).toBe('inline');
      });

      it('image should be in inline group', () => {
        expect(nodes.image.group).toBe('inline');
      });
    });
  });

  // -------------------------------------------------------------------------
  // 6. Serialization round-trip
  //    Invariant: serialize-deserialize-stable
  // -------------------------------------------------------------------------
  describe('Serialization round-trip', () => {
    it('should round-trip a simple paragraph', () => {
      const d = doc(paragraph('Hello, world!'));
      const json = d.toJSON();
      const restored = Node.fromJSON(inkwellSchema, json);
      expect(d.eq(restored)).toBe(true);
    });

    it('should round-trip a document with all block types', () => {
      const d = doc(
        h1('Title'),
        paragraph('A paragraph.'),
        h2('Subtitle'),
        blockquote(paragraph('Quoted text')),
        code_block('function hello() {}'),
        horizontal_rule(),
        bullet_list(
          list_item(paragraph('Bullet 1')),
          list_item(paragraph('Bullet 2')),
        ),
        ordered_list(
          list_item(paragraph('Step 1')),
          list_item(paragraph('Step 2')),
        ),
        paragraph('End.'),
      );
      const json = d.toJSON();
      const restored = Node.fromJSON(inkwellSchema, json);
      expect(d.eq(restored)).toBe(true);
    });

    it('should round-trip text with marks', () => {
      const d = doc(
        paragraph(
          bold('bold'),
          ' ',
          italic('italic'),
          ' ',
          underline('underline'),
          ' ',
          strikethrough('strike'),
          ' ',
          code('code'),
          ' ',
          link({ href: 'https://example.com', title: 'Link title' }, 'link'),
        ),
      );
      const json = d.toJSON();
      const restored = Node.fromJSON(inkwellSchema, json);
      expect(d.eq(restored)).toBe(true);
    });

    it('should round-trip nested marks', () => {
      const d = doc(paragraph(bold(italic(underline('multi-marked')))));
      const json = d.toJSON();
      const restored = Node.fromJSON(inkwellSchema, json);
      expect(d.eq(restored)).toBe(true);
    });

    it('should round-trip inline elements (hard_break, image)', () => {
      const d = doc(
        paragraph(
          'Line 1',
          hard_break(),
          'Line 2',
          image({ src: 'photo.jpg', alt: 'Photo', title: 'My Photo' }),
        ),
      );
      const json = d.toJSON();
      const restored = Node.fromJSON(inkwellSchema, json);
      expect(d.eq(restored)).toBe(true);
    });

    it('should round-trip deeply nested structure', () => {
      const d = doc(
        blockquote(
          paragraph(bold(italic('deep text'))),
          blockquote(
            paragraph('nested blockquote'),
            bullet_list(
              list_item(
                paragraph(link({ href: 'https://test.com' }, 'link in list')),
                code_block('nested code'),
              ),
            ),
          ),
        ),
      );
      const json = d.toJSON();
      const restored = Node.fromJSON(inkwellSchema, json);
      expect(d.eq(restored)).toBe(true);
    });

    it('should round-trip ordered list with custom order attribute', () => {
      const d = doc(
        ordered_list({ order: 3 },
          list_item(paragraph('Third')),
          list_item(paragraph('Fourth')),
        ),
      );
      const json = d.toJSON();
      const restored = Node.fromJSON(inkwellSchema, json);
      expect(d.eq(restored)).toBe(true);
      expect(restored.firstChild!.attrs.order).toBe(3);
    });

    it('should produce well-formed JSON', () => {
      const d = doc(
        h1('Title'),
        paragraph(bold('text'), ' and ', italic('more')),
      );
      const json = d.toJSON();

      // Validate JSON structure
      expect(json.type).toBe('doc');
      expect(json.content).toBeInstanceOf(Array);
      expect(json.content.length).toBe(2);

      // First child: heading
      expect(json.content[0].type).toBe('heading');
      expect(json.content[0].attrs.level).toBe(1);

      // Second child: paragraph
      expect(json.content[1].type).toBe('paragraph');
      expect(json.content[1].content.length).toBe(3); // bold text, plain text, italic text

      // Marks in JSON
      const boldEntry = json.content[1].content[0];
      expect(boldEntry.marks).toEqual([{ type: 'bold' }]);

      // Verify stringify -> parse -> fromJSON also works
      const jsonStr = JSON.stringify(json);
      const parsed = JSON.parse(jsonStr);
      const restored = Node.fromJSON(inkwellSchema, parsed);
      expect(d.eq(restored)).toBe(true);
    });

    it('should round-trip through HTML (DOM serialization)', () => {
      const d = doc(
        h1('Title'),
        paragraph(bold('bold'), ' and ', italic('italic')),
        blockquote(paragraph('Quoted')),
        code_block('let x = 1;'),
        bullet_list(list_item(paragraph('item'))),
      );

      const serializer = DOMSerializer.fromSchema(inkwellSchema);
      const parser = DOMParser.fromSchema(inkwellSchema);

      const domFragment = serializer.serializeFragment(d.content);
      const container = document.createElement('div');
      container.appendChild(domFragment);

      const restored = parser.parse(container);
      expect(d.eq(restored)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Additional edge cases
  // -------------------------------------------------------------------------
  describe('Edge cases', () => {
    it('should handle empty string text in paragraph', () => {
      // ProseMirror does not allow zero-length text nodes
      // schema.text('') should throw
      expect(() => inkwellSchema.text('')).toThrow();
    });

    it('should handle very long text in paragraph', () => {
      const longText = 'x'.repeat(100_000);
      const d = doc(paragraph(longText));
      expect(isValid(d)).toBe(true);
      expect(d.firstChild!.firstChild!.text).toBe(longText);
    });

    it('should handle unicode text', () => {
      const d = doc(paragraph('Hello, world! Emoji test. CJK: \u4F60\u597D'));
      const json = d.toJSON();
      const restored = Node.fromJSON(inkwellSchema, json);
      expect(d.eq(restored)).toBe(true);
    });

    it('should handle special characters in code_block', () => {
      const d = doc(code_block('<script>alert("xss")</script>\n\ttabs\nnewlines'));
      const json = d.toJSON();
      const restored = Node.fromJSON(inkwellSchema, json);
      expect(d.eq(restored)).toBe(true);
    });

    it('should handle image with special characters in src', () => {
      const d = doc(
        paragraph(
          image({ src: 'https://example.com/img?a=1&b=2', alt: 'Test "image"', title: "It's a test" }),
        ),
      );
      const json = d.toJSON();
      const restored = Node.fromJSON(inkwellSchema, json);
      expect(d.eq(restored)).toBe(true);
    });

    it('should handle link with special characters in href', () => {
      const d = doc(
        paragraph(
          link({ href: 'https://example.com/path?q=hello world&x=<>' }, 'click'),
        ),
      );
      const json = d.toJSON();
      const restored = Node.fromJSON(inkwellSchema, json);
      expect(d.eq(restored)).toBe(true);
    });

    it('should handle multiple consecutive hard_breaks', () => {
      const d = doc(paragraph('a', hard_break(), hard_break(), hard_break(), 'b'));
      expect(isValid(d)).toBe(true);
      // 5 children: text, br, br, br, text
      expect(d.firstChild!.childCount).toBe(5);
    });

    it('should handle doc with many blocks', () => {
      const paragraphs = Array.from({ length: 100 }, (_, i) =>
        paragraph(`Paragraph ${i}`),
      );
      const d = doc(...paragraphs);
      expect(isValid(d)).toBe(true);
      expect(d.childCount).toBe(100);
    });
  });
});
