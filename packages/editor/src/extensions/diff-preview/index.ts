/**
 * Diff Preview Extension (Decision 1-3-1b: Option C — Inline + floating toolbar)
 *
 * Renders AI edit proposals as inline diffs: deletions shown with red strikethrough,
 * additions shown as green underline widgets. A floating toolbar allows accept/reject.
 *
 * Protocol:
 * - Enter preview: `tr.setMeta(DiffPreviewPluginKey, { instructions })`
 * - Accept changes: `tr.setMeta(DiffPreviewPluginKey, { accept: true })`
 * - Reject / dismiss: `tr.setMeta(DiffPreviewPluginKey, { reject: true })` or `null`
 * - Auto-clear: any `tr.docChanged` (user typing) dismisses the preview
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { AIEditInstruction } from '@inkwell/shared';

export const DiffPreviewPluginKey = new PluginKey('diffPreview');

export interface DiffPreviewPluginState {
  active: boolean;
  instructions: AIEditInstruction[];
  decorations: DecorationSet;
}

export interface DiffPreviewShowMeta {
  instructions: AIEditInstruction[];
}

export interface DiffPreviewAcceptMeta {
  accept: true;
}

export interface DiffPreviewRejectMeta {
  reject: true;
}

export type DiffPreviewMeta =
  | DiffPreviewShowMeta
  | DiffPreviewAcceptMeta
  | DiffPreviewRejectMeta
  | null;

const EMPTY_STATE: DiffPreviewPluginState = {
  active: false,
  instructions: [],
  decorations: DecorationSet.empty,
};

/**
 * Build DecorationSet for the diff preview from instructions.
 */
function buildDecorations(
  instructions: AIEditInstruction[],
  doc: any,
): DecorationSet {
  const decorations: Decoration[] = [];

  for (const inst of instructions) {
    const { from, to } = inst.range;

    switch (inst.type) {
      case 'delete': {
        // Highlight the deleted range with strikethrough
        decorations.push(
          Decoration.inline(from, to, { class: 'inkwell-diff-delete' }),
        );
        break;
      }

      case 'insert': {
        // Show inserted text as a widget at the insertion point
        const content = inst.content || '';
        decorations.push(
          Decoration.widget(
            from,
            () => {
              const span = document.createElement('span');
              span.className = 'inkwell-diff-insert';
              span.textContent = content;
              return span;
            },
            { side: 1 },
          ),
        );
        break;
      }

      case 'replace': {
        // Mark the old text for deletion
        if (from < to) {
          decorations.push(
            Decoration.inline(from, to, { class: 'inkwell-diff-delete' }),
          );
        }
        // Show the new text as an insertion widget
        const content = inst.content || '';
        decorations.push(
          Decoration.widget(
            to,
            () => {
              const span = document.createElement('span');
              span.className = 'inkwell-diff-insert';
              span.textContent = content;
              return span;
            },
            { side: 1 },
          ),
        );
        break;
      }
    }
  }

  // Add floating toolbar widget at the position of the first instruction
  if (instructions.length > 0) {
    const toolbarPos = instructions[0].range.from;
    decorations.push(
      Decoration.widget(
        toolbarPos,
        (view) => {
          const toolbar = document.createElement('div');
          toolbar.className = 'inkwell-diff-toolbar';

          const acceptBtn = document.createElement('button');
          acceptBtn.className = 'inkwell-diff-accept';
          acceptBtn.textContent = 'Accept';
          acceptBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (view) {
              const tr = view.state.tr.setMeta(DiffPreviewPluginKey, { accept: true });
              view.dispatch(tr);
            }
          });

          const rejectBtn = document.createElement('button');
          rejectBtn.className = 'inkwell-diff-reject';
          rejectBtn.textContent = 'Reject';
          rejectBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (view) {
              const tr = view.state.tr.setMeta(DiffPreviewPluginKey, { reject: true });
              view.dispatch(tr);
            }
          });

          toolbar.appendChild(acceptBtn);
          toolbar.appendChild(rejectBtn);
          return toolbar;
        },
        { side: -1 },
      ),
    );
  }

  return DecorationSet.create(doc, decorations);
}

/**
 * TipTap extension that renders inline diffs for AI edit proposals.
 *
 * Uses decoration-based rendering following the same pattern as ghost-text.
 */
export const DiffPreview = Extension.create({
  name: 'diffPreview',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: DiffPreviewPluginKey,
        state: {
          init(): DiffPreviewPluginState {
            return EMPTY_STATE;
          },
          apply(tr, pluginState: DiffPreviewPluginState, _oldState, newState): DiffPreviewPluginState {
            const meta = tr.getMeta(DiffPreviewPluginKey) as DiffPreviewMeta | undefined;

            // Explicit reject or clear
            if (meta === null || (meta && 'reject' in meta && meta.reject)) {
              return EMPTY_STATE;
            }

            // Accept: apply the instructions to the document
            if (meta && 'accept' in meta && meta.accept) {
              // The actual document changes are dispatched separately
              // by the extension's accept handler. Here we just clear preview state.
              return EMPTY_STATE;
            }

            // New diff preview instructions
            if (meta && 'instructions' in meta) {
              const instructions = meta.instructions;
              return {
                active: true,
                instructions,
                decorations: buildDecorations(instructions, newState.doc),
              };
            }

            // Auto-clear on user typing (doc changed without our meta)
            if (tr.docChanged && pluginState.active) {
              return EMPTY_STATE;
            }

            // Map decorations through any position changes
            if (pluginState.active) {
              return {
                ...pluginState,
                decorations: pluginState.decorations.map(tr.mapping, tr.doc),
              };
            }

            return pluginState;
          },
        },
        props: {
          decorations(state) {
            const pluginState = DiffPreviewPluginKey.getState(state) as DiffPreviewPluginState;
            return pluginState?.decorations ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
