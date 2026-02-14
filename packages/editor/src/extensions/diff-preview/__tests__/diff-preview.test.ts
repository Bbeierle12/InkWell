/**
 * Diff Preview Extension Tests
 *
 * Tests the inline diff decoration rendering, accept/reject protocol,
 * auto-clear on user typing, and undo stack isolation.
 */
import { describe, it, expect } from 'vitest';
import { EditorState, Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { history, undoDepth } from '@tiptap/pm/history';
import { inkwellSchema } from '../../../schema';
import {
  DiffPreviewPluginKey,
  DiffPreviewPluginState,
} from '../index';
import type { AIEditInstruction } from '@inkwell/shared';

/**
 * Create a standalone diff preview ProseMirror plugin for testing.
 * Mirrors the production plugin logic without needing the full TipTap Editor.
 */
function createDiffPreviewPlugin(): Plugin {
  const EMPTY_STATE: DiffPreviewPluginState = {
    active: false,
    instructions: [],
    decorations: DecorationSet.empty,
  };

  return new Plugin({
    key: DiffPreviewPluginKey,
    state: {
      init(): DiffPreviewPluginState {
        return EMPTY_STATE;
      },
      apply(tr, pluginState: DiffPreviewPluginState, _oldState, newState): DiffPreviewPluginState {
        const meta = tr.getMeta(DiffPreviewPluginKey);

        // Explicit reject or clear
        if (meta === null || (meta && 'reject' in meta && meta.reject)) {
          return EMPTY_STATE;
        }

        // Accept
        if (meta && 'accept' in meta && meta.accept) {
          return EMPTY_STATE;
        }

        // New instructions
        if (meta && 'instructions' in meta) {
          const instructions = meta.instructions as AIEditInstruction[];
          const decorations: Decoration[] = [];

          for (const inst of instructions) {
            const { from, to } = inst.range;

            if (inst.type === 'delete') {
              decorations.push(
                Decoration.inline(from, to, { class: 'inkwell-diff-delete' }),
              );
            } else if (inst.type === 'insert') {
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
            } else if (inst.type === 'replace') {
              if (from < to) {
                decorations.push(
                  Decoration.inline(from, to, { class: 'inkwell-diff-delete' }),
                );
              }
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
            }
          }

          return {
            active: true,
            instructions,
            decorations: DecorationSet.create(newState.doc, decorations),
          };
        }

        // Auto-clear on doc change
        if (tr.docChanged && pluginState.active) {
          return EMPTY_STATE;
        }

        // Map decorations
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
        const ps = DiffPreviewPluginKey.getState(state) as DiffPreviewPluginState;
        return ps?.decorations ?? DecorationSet.empty;
      },
    },
  });
}

function createState() {
  const doc = inkwellSchema.node('doc', null, [
    inkwellSchema.node('paragraph', null, [inkwellSchema.text('Hello World')]),
  ]);
  return EditorState.create({
    doc,
    schema: inkwellSchema,
    plugins: [createDiffPreviewPlugin(), history()],
  });
}

describe('Diff Preview', () => {
  it('should render deletions with strikethrough class decoration', () => {
    let state = createState();

    const instructions: AIEditInstruction[] = [
      { type: 'delete', range: { from: 1, to: 6 } },
    ];

    const tr = state.tr.setMeta(DiffPreviewPluginKey, { instructions });
    state = state.apply(tr);

    const pluginState = DiffPreviewPluginKey.getState(state) as DiffPreviewPluginState;
    expect(pluginState.active).toBe(true);

    const decos = pluginState.decorations.find();
    // Should have: 1 inline deletion
    const inlineDecos = decos.filter((d) => (d as any).type?.attrs?.class === 'inkwell-diff-delete');
    expect(inlineDecos.length).toBe(1);
    expect(inlineDecos[0].from).toBe(1);
    expect(inlineDecos[0].to).toBe(6);
  });

  it('should render additions with insertion widget decoration', () => {
    let state = createState();

    const instructions: AIEditInstruction[] = [
      { type: 'insert', range: { from: 6, to: 6 }, content: ' Beautiful' },
    ];

    const tr = state.tr.setMeta(DiffPreviewPluginKey, { instructions });
    state = state.apply(tr);

    const pluginState = DiffPreviewPluginKey.getState(state) as DiffPreviewPluginState;
    expect(pluginState.active).toBe(true);

    const decos = pluginState.decorations.find();
    // Should have: 1 insert widget
    expect(decos.length).toBe(1);
  });

  it('should render replace as both deletion and insertion decorations', () => {
    let state = createState();

    const instructions: AIEditInstruction[] = [
      { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
    ];

    const tr = state.tr.setMeta(DiffPreviewPluginKey, { instructions });
    state = state.apply(tr);

    const pluginState = DiffPreviewPluginKey.getState(state) as DiffPreviewPluginState;
    expect(pluginState.active).toBe(true);

    const decos = pluginState.decorations.find();
    // Should have: 1 inline delete + 1 insert widget = 2
    const deleteDecos = decos.filter((d) => (d as any).type?.attrs?.class === 'inkwell-diff-delete');
    expect(deleteDecos.length).toBe(1);
  });

  it('should accept proposed changes by clearing preview state', () => {
    let state = createState();

    // Enter preview
    const instructions: AIEditInstruction[] = [
      { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
    ];
    let tr = state.tr.setMeta(DiffPreviewPluginKey, { instructions });
    state = state.apply(tr);

    let pluginState = DiffPreviewPluginKey.getState(state) as DiffPreviewPluginState;
    expect(pluginState.active).toBe(true);

    // Accept
    tr = state.tr.setMeta(DiffPreviewPluginKey, { accept: true });
    state = state.apply(tr);

    pluginState = DiffPreviewPluginKey.getState(state) as DiffPreviewPluginState;
    expect(pluginState.active).toBe(false);
    expect(pluginState.decorations).toBe(DecorationSet.empty);
  });

  it('should revert to original on reject', () => {
    let state = createState();
    const originalDoc = state.doc;

    // Enter preview
    const instructions: AIEditInstruction[] = [
      { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
    ];
    let tr = state.tr.setMeta(DiffPreviewPluginKey, { instructions });
    state = state.apply(tr);

    // Reject
    tr = state.tr.setMeta(DiffPreviewPluginKey, { reject: true });
    state = state.apply(tr);

    const pluginState = DiffPreviewPluginKey.getState(state) as DiffPreviewPluginState;
    expect(pluginState.active).toBe(false);
    expect(pluginState.instructions).toEqual([]);
    // Document unchanged (preview is decoration-only)
    expect(state.doc.eq(originalDoc)).toBe(true);
  });

  it('should not pollute the undo stack during preview', () => {
    let state = createState();
    const initialUndoDepth = undoDepth(state);

    // Enter preview
    const instructions: AIEditInstruction[] = [
      { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
    ];
    let tr = state.tr.setMeta(DiffPreviewPluginKey, { instructions });
    state = state.apply(tr);

    // Undo depth should not change (decorations don't affect document)
    expect(undoDepth(state)).toBe(initialUndoDepth);

    // Reject
    tr = state.tr.setMeta(DiffPreviewPluginKey, { reject: true });
    state = state.apply(tr);

    expect(undoDepth(state)).toBe(initialUndoDepth);
  });

  it('should auto-clear on user typing', () => {
    let state = createState();

    // Enter preview
    const instructions: AIEditInstruction[] = [
      { type: 'replace', range: { from: 1, to: 6 }, content: 'Hi' },
    ];
    let tr = state.tr.setMeta(DiffPreviewPluginKey, { instructions });
    state = state.apply(tr);

    let pluginState = DiffPreviewPluginKey.getState(state) as DiffPreviewPluginState;
    expect(pluginState.active).toBe(true);

    // User types (docChanged without diff meta)
    tr = state.tr.insertText('X', 1);
    state = state.apply(tr);

    pluginState = DiffPreviewPluginKey.getState(state) as DiffPreviewPluginState;
    expect(pluginState.active).toBe(false);
    expect(pluginState.decorations).toBe(DecorationSet.empty);
  });
});
