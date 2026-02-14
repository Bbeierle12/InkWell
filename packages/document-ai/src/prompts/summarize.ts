/**
 * Summarize Prompt Template
 *
 * System and user prompts for the summarize operation.
 * Instructs the model to condense a selection while preserving key points.
 */
import type { PromptTemplate } from './index';

export const summarizeTemplate: PromptTemplate = {
  system:
    'You are InkWell AI, a writing assistant embedded in a word processor. ' +
    'Your task is to summarize the user\'s selected text into a concise version. ' +
    'Preserve all key points and factual information. ' +
    'Respond ONLY with a JSON array of edit instructions, no surrounding text.',

  userTemplate:
    'Document context:\n{{document_context}}\n\n' +
    'Selected text to summarize:\n{{selection}}\n\n' +
    'Condense the selected text into a concise summary that preserves all key points. ' +
    'Respond with a JSON array of AIEditInstruction objects:\n' +
    '[{"type": "replace", "range": {"from": <start>, "to": <end>}, "content": "<summarized text>"}]\n' +
    'Respond ONLY with the JSON array, no surrounding text.',
};
