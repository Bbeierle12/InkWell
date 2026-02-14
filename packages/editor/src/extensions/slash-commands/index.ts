/**
 * Slash Commands Extension
 *
 * Provides a "/" trigger that opens a command palette for AI operations.
 */
import { Extension } from '@tiptap/core';

export interface SlashCommandItem {
  title: string;
  description: string;
  command: string;
}

/**
 * TipTap extension for slash-command AI invocations.
 */
export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    // TODO: implement
    // - Detect "/" at start of line or after whitespace
    // - Show floating command palette
    // - Execute selected command
    throw new Error('not implemented');
  },
});
