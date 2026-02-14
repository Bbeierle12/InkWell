/**
 * Prompt Template Registry
 *
 * Maps operation types to their prompt templates and provides
 * variable substitution for rendering prompts.
 */
import { OperationType } from '@inkwell/shared';
import { rewriteTemplate } from './rewrite';
import { summarizeTemplate } from './summarize';
import { expandTemplate } from './expand';
import { critiqueTemplate } from './critique';

export interface PromptTemplate {
  /** System prompt sent as the system parameter. */
  system: string;
  /** User message template with {{placeholder}} variables. */
  userTemplate: string;
}

const templateMap: Record<string, PromptTemplate> = {
  [OperationType.Rewrite]: rewriteTemplate,
  [OperationType.Summarize]: summarizeTemplate,
  [OperationType.Expand]: expandTemplate,
  [OperationType.Critique]: critiqueTemplate,
};

/**
 * Get the prompt template for a given operation type.
 *
 * Throws for InlineSuggest (local-only, no prompt template) and VoiceRefine.
 */
export function getPromptTemplate(operation: OperationType): PromptTemplate {
  const template = templateMap[operation];
  if (!template) {
    throw new Error(
      `No prompt template for operation "${operation}". ` +
      `Only rewrite, summarize, expand, and critique have templates.`,
    );
  }
  return template;
}

/**
 * Render a prompt template by substituting {{key}} placeholders with values.
 *
 * @returns Object with resolved system and user strings.
 */
export function renderPrompt(
  template: PromptTemplate,
  vars: Record<string, string>,
): { system: string; user: string } {
  let user = template.userTemplate;
  for (const [key, value] of Object.entries(vars)) {
    user = user.replaceAll(`{{${key}}}`, value);
  }
  return {
    system: template.system,
    user,
  };
}
