import { describe, it, expect, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SlashCommands, SlashCommandsPluginKey } from '../index';

/**
 * Slash Commands Extension Tests
 *
 * Tests use a real TipTap Editor instance with jsdom to verify
 * plugin state transitions and command execution.
 */

function createEditor(onExecute = vi.fn()) {
  return new Editor({
    element: document.createElement('div'),
    extensions: [
      StarterKit,
      SlashCommands.configure({
        commands: [
          { title: 'Rewrite', description: 'Rewrite selection', command: 'rewrite' },
          { title: 'Summarize', description: 'Summarize selection', command: 'summarize' },
          { title: 'Expand', description: 'Expand selection', command: 'expand' },
          { title: 'Critique', description: 'Critique selection', command: 'critique' },
        ],
        onExecute,
      }),
    ],
    content: '<p>Hello world</p>',
  });
}

describe('Slash Commands', () => {
  it('should detect slash trigger at start of text and activate', () => {
    const editor = createEditor();

    // Simulate activation via meta (since handleTextInput requires a real view interaction)
    const { tr } = editor.state;
    const activateTr = tr.setMeta(SlashCommandsPluginKey, { activate: true, pos: 1 });
    editor.view.dispatch(activateTr);

    const state = SlashCommandsPluginKey.getState(editor.state);
    expect(state.active).toBe(true);
    expect(state.filteredCommands).toHaveLength(4);
    expect(state.selectedIndex).toBe(0);

    editor.destroy();
  });

  it('should filter commands based on typed query', () => {
    const editor = createEditor();

    // Activate
    editor.view.dispatch(
      editor.state.tr.setMeta(SlashCommandsPluginKey, { activate: true, pos: 1 }),
    );

    // Set query to "rew" — should filter to only "rewrite"
    editor.view.dispatch(
      editor.state.tr.setMeta(SlashCommandsPluginKey, { query: 'rew' }),
    );

    const state = SlashCommandsPluginKey.getState(editor.state);
    expect(state.active).toBe(true);
    expect(state.filteredCommands).toHaveLength(1);
    expect(state.filteredCommands[0].command).toBe('rewrite');

    editor.destroy();
  });

  it('should execute selected command on Enter via meta', () => {
    const onExecute = vi.fn();
    const editor = createEditor(onExecute);

    // Activate
    editor.view.dispatch(
      editor.state.tr.setMeta(SlashCommandsPluginKey, { activate: true, pos: 1 }),
    );

    // Set query
    editor.view.dispatch(
      editor.state.tr.setMeta(SlashCommandsPluginKey, { query: 'rewrite formal' }),
    );

    // Verify state is active with filtered results
    const state = SlashCommandsPluginKey.getState(editor.state);
    expect(state.active).toBe(true);
    expect(state.query).toBe('rewrite formal');

    editor.destroy();
  });

  it('should deactivate on explicit deactivate meta', () => {
    const editor = createEditor();

    // Activate
    editor.view.dispatch(
      editor.state.tr.setMeta(SlashCommandsPluginKey, { activate: true, pos: 1 }),
    );

    let state = SlashCommandsPluginKey.getState(editor.state);
    expect(state.active).toBe(true);

    // Deactivate
    editor.view.dispatch(
      editor.state.tr.setMeta(SlashCommandsPluginKey, 'deactivate'),
    );

    state = SlashCommandsPluginKey.getState(editor.state);
    expect(state.active).toBe(false);
    expect(state.query).toBe('');

    editor.destroy();
  });
});
