/**
 * Rewrite Prompt Template
 *
 * System and user prompts for the rewrite operation.
 * Instructs the model to rewrite a selection matching a target tone.
 */
import type { PromptTemplate } from './index';

export const rewriteTemplate: PromptTemplate = {
  system:
    'You are InkWell AI, a writing assistant embedded in a word processor. ' +
    'Your task is to rewrite the user\'s selected text to match a specified tone and style. ' +
    'Preserve the original meaning while transforming the voice. ' +
    'Respond ONLY with a JSON array of edit instructions, no surrounding text.',

  userTemplate:
    'Document context:\n{{document_context}}\n\n' +
    'Selected text to rewrite:\n{{selection}}\n\n' +
    'Target tone: {{target_tone}}\n' +
    'Style profile: {{style_profile}}\n\n' +
    'Rewrite the selected text to match the target tone. ' +
    'Respond with a JSON array of AIEditInstruction objects:\n' +
    '[{"type": "replace", "range": {"from": <start>, "to": <end>}, "content": "<rewritten text>"}]\n' +
    'Respond ONLY with the JSON array, no surrounding text.',
};
