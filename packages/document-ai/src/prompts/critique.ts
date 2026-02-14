/**
 * Critique Prompt Template
 *
 * System and user prompts for the critique operation.
 * Instructs the model to provide analytical feedback on a selection.
 * NOTE: Critique is a non-editing operation — output is observations + suggestions, not AIEditInstructions.
 */
import type { PromptTemplate } from './index';

export const critiqueTemplate: PromptTemplate = {
  system:
    'You are InkWell AI, a writing assistant embedded in a word processor. ' +
    'Your task is to provide an analytical critique of the user\'s selected text. ' +
    'Evaluate structure, clarity, style, and argumentation. ' +
    'Respond ONLY with a JSON object containing observations and suggestions, no surrounding text.',

  userTemplate:
    'Document context:\n{{document_context}}\n\n' +
    'Selected text to critique:\n{{selection}}\n\n' +
    'Provide a thorough critique of the selected text. Evaluate structure, ' +
    'clarity, style, and argumentation.\n\n' +
    'Respond with a JSON object:\n' +
    '{"observations": ["<observation 1>", ...], "suggestions": ["<suggestion 1>", ...]}\n' +
    'Respond ONLY with the JSON object, no surrounding text.',
};
