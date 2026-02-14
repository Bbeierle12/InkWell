/**
 * Slash Commands Extension
 *
 * Provides a "/" trigger that opens a command palette for AI operations.
 * Detects "/" at start of line or after whitespace, shows a floating
 * command list, and executes the selected command.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

export interface SlashCommandItem {
  title: string;
  description: string;
  command: string;
}

export interface SlashCommandsOptions {
  commands: SlashCommandItem[];
  onExecute: (command: string, args: string, selection: { from: number; to: number }) => void;
}

export const SlashCommandsPluginKey = new PluginKey('slashCommands');

interface SlashCommandsPluginState {
  active: boolean;
  query: string;
  triggerPos: number;
  filteredCommands: SlashCommandItem[];
  selectedIndex: number;
}

const EMPTY_STATE: SlashCommandsPluginState = {
  active: false,
  query: '',
  triggerPos: -1,
  filteredCommands: [],
  selectedIndex: 0,
};

function filterCommands(commands: SlashCommandItem[], query: string): SlashCommandItem[] {
  if (!query) return commands;
  const lower = query.toLowerCase();
  return commands.filter(
    (cmd) =>
      cmd.command.toLowerCase().startsWith(lower) ||
      cmd.title.toLowerCase().startsWith(lower),
  );
}

/** Dismiss the slash menu: delete typed slash text and deactivate. */
function dismissSlashMenu(view: EditorView, pluginState: SlashCommandsPluginState): void {
  const deleteFrom = pluginState.triggerPos;
  const deleteTo = view.state.selection.from;
  if (deleteTo > deleteFrom) {
    const deleteTr = view.state.tr.delete(deleteFrom, deleteTo);
    view.dispatch(deleteTr);
  }
  const deactivateTr = view.state.tr.setMeta(SlashCommandsPluginKey, 'deactivate');
  view.dispatch(deactivateTr);
}

/**
 * TipTap extension for slash-command AI invocations.
 */
export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return {
      commands: [],
      onExecute: () => {},
    };
  },

  addProseMirrorPlugins() {
    const extensionOptions = this.options;

    return [
      new Plugin({
        key: SlashCommandsPluginKey,

        state: {
          init(): SlashCommandsPluginState {
            return EMPTY_STATE;
          },

          apply(tr, pluginState: SlashCommandsPluginState): SlashCommandsPluginState {
            // Check for explicit deactivation meta
            const meta = tr.getMeta(SlashCommandsPluginKey);
            if (meta === 'deactivate') {
              return EMPTY_STATE;
            }

            if (meta && typeof meta === 'object' && 'activate' in meta) {
              const filtered = filterCommands(extensionOptions.commands, '');
              return {
                active: true,
                query: '',
                triggerPos: (meta as { activate: true; pos: number }).pos,
                filteredCommands: filtered,
                selectedIndex: 0,
              };
            }

            if (meta && typeof meta === 'object' && 'query' in meta) {
              const query = (meta as { query: string }).query;
              const filtered = filterCommands(extensionOptions.commands, query);
              return {
                ...pluginState,
                query,
                filteredCommands: filtered,
                selectedIndex: Math.min(pluginState.selectedIndex, Math.max(0, filtered.length - 1)),
              };
            }

            if (meta && typeof meta === 'object' && 'selectedIndex' in meta) {
              return {
                ...pluginState,
                selectedIndex: (meta as { selectedIndex: number }).selectedIndex,
              };
            }

            // Auto-deactivate on doc changes not caused by our extension
            if (tr.docChanged && pluginState.active && !tr.getMeta(SlashCommandsPluginKey)) {
              // Check if the slash trigger text still exists
              return EMPTY_STATE;
            }

            return pluginState;
          },
        },

        // Manage click-outside dismissal listener
        view(editorView: EditorView) {
          let menuActive = false;

          const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('.inkwell-slash-menu')) return;

            const state = SlashCommandsPluginKey.getState(editorView.state) as SlashCommandsPluginState;
            if (!state.active) return;

            dismissSlashMenu(editorView, state);
          };

          return {
            update(view: EditorView) {
              const state = SlashCommandsPluginKey.getState(view.state) as SlashCommandsPluginState;
              if (state.active && !menuActive) {
                menuActive = true;
                setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
              } else if (!state.active && menuActive) {
                menuActive = false;
                document.removeEventListener('mousedown', handleClickOutside);
              }
            },
            destroy() {
              document.removeEventListener('mousedown', handleClickOutside);
            },
          };
        },

        props: {
          handleTextInput(view, from, _to, text) {
            const state = SlashCommandsPluginKey.getState(view.state) as SlashCommandsPluginState;

            // Detect "/" trigger at start of line or after whitespace
            if (text === '/' && !state.active) {
              const $pos = view.state.doc.resolve(from);

              // Do not trigger inside code blocks or inline code
              if ($pos.parent.type.name === 'codeBlock') {
                return false;
              }
              if ($pos.marks().some((mark: any) => mark.type.name === 'code')) {
                return false;
              }

              const textBefore = $pos.parent.textBetween(
                0,
                $pos.parentOffset,
                undefined,
                '\ufffc',
              );

              // Trigger if at start of block or after whitespace
              if (textBefore.length === 0 || /\s$/.test(textBefore)) {
                // Insert the "/" character first
                view.dispatch(view.state.tr.insertText('/', from, from));

                // Activate the menu
                const tr = view.state.tr.setMeta(SlashCommandsPluginKey, {
                  activate: true,
                  pos: from,
                });
                view.dispatch(tr);
                return true;
              }
            }

            // While active, accumulate query
            if (state.active) {
              // Let ProseMirror insert the text, then update query
              view.dispatch(view.state.tr.insertText(text, from, from));
              const newQuery = state.query + text;
              const tr = view.state.tr.setMeta(SlashCommandsPluginKey, { query: newQuery });
              view.dispatch(tr);
              return true;
            }

            return false;
          },

          handleKeyDown(view, event) {
            const state = SlashCommandsPluginKey.getState(view.state) as SlashCommandsPluginState;
            if (!state.active) return false;

            switch (event.key) {
              case 'ArrowUp': {
                event.preventDefault();
                const newIndex = Math.max(0, state.selectedIndex - 1);
                const tr = view.state.tr.setMeta(SlashCommandsPluginKey, { selectedIndex: newIndex });
                view.dispatch(tr);
                return true;
              }

              case 'ArrowDown': {
                event.preventDefault();
                const newIndex = Math.min(
                  state.filteredCommands.length - 1,
                  state.selectedIndex + 1,
                );
                const tr = view.state.tr.setMeta(SlashCommandsPluginKey, { selectedIndex: newIndex });
                view.dispatch(tr);
                return true;
              }

              case 'Enter': {
                event.preventDefault();

                // Parse query into commandName + args
                const parts = state.query.split(/\s+/);
                const commandName = parts[0] || '';
                const args = parts.slice(1).join(' ');

                // Delete the slash command text: from triggerPos to current cursor
                const deleteFrom = state.triggerPos;
                const deleteTo = view.state.selection.from;
                const deleteTr = view.state.tr.delete(deleteFrom, deleteTo);
                view.dispatch(deleteTr);

                // Deactivate
                const deactivateTr = view.state.tr.setMeta(SlashCommandsPluginKey, 'deactivate');
                view.dispatch(deactivateTr);

                // Read selection AFTER deletion so positions reflect the cleaned-up document
                const { from, to } = view.state.selection;
                extensionOptions.onExecute(commandName, args, { from, to });
                return true;
              }

              case 'Escape': {
                event.preventDefault();
                dismissSlashMenu(view, state);
                return true;
              }

              default:
                return false;
            }
          },

          decorations(state) {
            const pluginState = SlashCommandsPluginKey.getState(state) as SlashCommandsPluginState;
            if (!pluginState.active || pluginState.filteredCommands.length === 0) {
              return DecorationSet.empty;
            }

            const widget = Decoration.widget(
              pluginState.triggerPos,
              () => {
                const container = document.createElement('div');
                container.className = 'inkwell-slash-menu';
                container.setAttribute('role', 'listbox');
                container.setAttribute('aria-label', 'Slash commands');
                container.id = 'inkwell-slash-menu';

                for (let i = 0; i < pluginState.filteredCommands.length; i++) {
                  const cmd = pluginState.filteredCommands[i];
                  const isSelected = i === pluginState.selectedIndex;
                  const itemId = `inkwell-slash-item-${i}`;
                  const item = document.createElement('div');
                  item.className =
                    'inkwell-slash-item' +
                    (isSelected ? ' inkwell-slash-item-selected' : '');
                  item.setAttribute('role', 'option');
                  item.setAttribute('aria-selected', String(isSelected));
                  item.id = itemId;
                  item.textContent = `${cmd.title} — ${cmd.description}`;
                  container.appendChild(item);

                  if (isSelected) {
                    container.setAttribute('aria-activedescendant', itemId);
                  }
                }

                return container;
              },
              { side: -1 },
            );

            return DecorationSet.create(state.doc, [widget]);
          },
        },
      }),
    ];
  },
});
