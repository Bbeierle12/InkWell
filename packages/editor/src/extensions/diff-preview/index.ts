/**
 * Diff Preview Extension
 *
 * Renders before/after diff for AI rewrite operations,
 * showing additions and deletions inline.
 */
import { Extension } from '@tiptap/core';

/**
 * TipTap extension that renders inline diffs for AI edit proposals.
 */
export const DiffPreview = Extension.create({
  name: 'diffPreview',

  addProseMirrorPlugins() {
    // TODO: implement
    // - Accept a diff (old text, new text)
    // - Render deletions with strikethrough + red
    // - Render additions with underline + green
    // - Provide accept/reject actions
    throw new Error('not implemented');
  },
});
