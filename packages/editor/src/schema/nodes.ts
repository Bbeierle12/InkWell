/**
 * ProseMirror node type definitions for the Inkwell schema.
 */
import type { NodeSpec } from '@tiptap/pm/model';

/** All node types used in Inkwell documents. */
export const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },

  paragraph: {
    group: 'block',
    content: 'inline*',
    parseDOM: [{ tag: 'p' }],
    toDOM() {
      return ['p', 0];
    },
  },

  heading: {
    attrs: { level: { default: 1 } },
    content: 'inline*',
    group: 'block',
    defining: true,
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      attrs: { level },
    })),
    toDOM(node) {
      return [`h${node.attrs.level}`, 0];
    },
  },

  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    parseDOM: [{ tag: 'blockquote' }],
    toDOM() {
      return ['blockquote', 0];
    },
  },

  code_block: {
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
    toDOM() {
      return ['pre', ['code', 0]];
    },
  },

  horizontal_rule: {
    group: 'block',
    parseDOM: [{ tag: 'hr' }],
    toDOM() {
      return ['hr'];
    },
  },

  bullet_list: {
    content: 'list_item+',
    group: 'block',
    parseDOM: [{ tag: 'ul' }],
    toDOM() {
      return ['ul', 0];
    },
  },

  ordered_list: {
    attrs: { order: { default: 1 } },
    content: 'list_item+',
    group: 'block',
    parseDOM: [{ tag: 'ol' }],
    toDOM(node) {
      return node.attrs.order === 1 ? ['ol', 0] : ['ol', { start: node.attrs.order }, 0];
    },
  },

  list_item: {
    content: 'paragraph block*',
    parseDOM: [{ tag: 'li' }],
    toDOM() {
      return ['li', 0];
    },
  },

  text: { group: 'inline' },

  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM() {
      return ['br'];
    },
  },

  image: {
    inline: true,
    attrs: { src: {}, alt: { default: null }, title: { default: null } },
    group: 'inline',
    draggable: true,
    parseDOM: [{ tag: 'img[src]' }],
    toDOM(node) {
      return ['img', node.attrs];
    },
  },
};
