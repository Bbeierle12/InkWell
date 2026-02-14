/**
 * ProseMirror mark definitions for the Inkwell schema.
 */
import type { MarkSpec } from '@tiptap/pm/model';

/** All mark types used in Inkwell documents. */
export const marks: Record<string, MarkSpec> = {
  bold: {
    parseDOM: [
      { tag: 'strong' },
      { tag: 'b' },
      { style: 'font-weight=bold' },
    ],
    toDOM() {
      return ['strong', 0];
    },
  },

  italic: {
    parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }],
    toDOM() {
      return ['em', 0];
    },
  },

  underline: {
    parseDOM: [{ tag: 'u' }, { style: 'text-decoration=underline' }],
    toDOM() {
      return ['u', 0];
    },
  },

  strikethrough: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { style: 'text-decoration=line-through' }],
    toDOM() {
      return ['s', 0];
    },
  },

  code: {
    parseDOM: [{ tag: 'code' }],
    toDOM() {
      return ['code', 0];
    },
  },

  link: {
    attrs: { href: {}, title: { default: null } },
    inclusive: false,
    parseDOM: [{ tag: 'a[href]' }],
    toDOM(node) {
      return ['a', node.attrs, 0];
    },
  },
};
