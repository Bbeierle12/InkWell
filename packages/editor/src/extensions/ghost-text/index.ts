/**
 * Ghost Text Extension
 *
 * Renders AI inline suggestions as translucent decorations ahead of the cursor.
 * Uses decoration-based rendering (never serialized to the document).
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const GhostTextPluginKey = new PluginKey('ghostText');

export interface GhostTextOptions {
  /** CSS class applied to ghost text decorations. */
  className: string;
}

export interface GhostTextMeta {
  text: string;
  pos: number;
}

/**
 * TipTap extension that displays AI-generated ghost text as ProseMirror decorations.
 *
 * Usage:
 * - Set ghost text: `tr.setMeta(GhostTextPluginKey, { text: 'suggestion', pos: cursorPos })`
 * - Clear ghost text: `tr.setMeta(GhostTextPluginKey, null)`
 * - Ghost text is automatically cleared when the document changes (user typing).
 */
export const GhostText = Extension.create<GhostTextOptions>({
  name: 'ghostText',

  addOptions() {
    return { className: 'inkwell-ghost-text' };
  },

  addProseMirrorPlugins() {
    const className = this.options.className;
    return [
      new Plugin({
        key: GhostTextPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, decorations, _oldState, newState) {
            const meta = tr.getMeta(GhostTextPluginKey);

            // Explicit clear
            if (meta === null) {
              return DecorationSet.empty;
            }

            // New ghost text
            if (meta && typeof meta === 'object' && 'text' in meta) {
              const { text, pos } = meta as GhostTextMeta;
              const widget = Decoration.widget(
                pos,
                () => {
                  const span = document.createElement('span');
                  span.className = className;
                  span.textContent = text;
                  return span;
                },
                { side: 1 },
              );
              return DecorationSet.create(newState.doc, [widget]);
            }

            // If the document changed (user typed), clear ghost text
            if (tr.docChanged) {
              return DecorationSet.empty;
            }

            // Otherwise map existing decorations through document changes
            return decorations.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return GhostTextPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});
