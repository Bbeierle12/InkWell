import { describe, it, expect } from 'vitest';
import { OperationType } from '@inkwell/shared';
import { getPromptTemplate, renderPrompt } from '../index';

describe('Prompt Templates', () => {
  it('should return a template for rewrite operation', () => {
    const template = getPromptTemplate(OperationType.Rewrite);
    expect(template.system).toBeTruthy();
    expect(template.userTemplate).toBeTruthy();
    expect(template.userTemplate).toContain('{{document_context}}');
    expect(template.userTemplate).toContain('{{selection}}');
    expect(template.userTemplate).toContain('{{target_tone}}');
    expect(template.userTemplate).toContain('{{style_profile}}');
  });

  it('should return a template for summarize operation', () => {
    const template = getPromptTemplate(OperationType.Summarize);
    expect(template.system).toBeTruthy();
    expect(template.userTemplate).toBeTruthy();
    expect(template.userTemplate).toContain('{{document_context}}');
    expect(template.userTemplate).toContain('{{selection}}');
  });

  it('should return a template for expand operation', () => {
    const template = getPromptTemplate(OperationType.Expand);
    expect(template.system).toBeTruthy();
    expect(template.userTemplate).toBeTruthy();
    expect(template.userTemplate).toContain('{{document_context}}');
    expect(template.userTemplate).toContain('{{selection}}');
  });

  it('should return a template for critique operation', () => {
    const template = getPromptTemplate(OperationType.Critique);
    expect(template.system).toBeTruthy();
    expect(template.userTemplate).toBeTruthy();
    expect(template.userTemplate).toContain('{{document_context}}');
    expect(template.userTemplate).toContain('{{selection}}');
    expect(template.userTemplate).toContain('observations');
    expect(template.userTemplate).toContain('suggestions');
  });

  it('should throw for InlineSuggest (local-only, no prompt template)', () => {
    expect(() => getPromptTemplate(OperationType.InlineSuggest)).toThrow(
      /no prompt template/i,
    );
  });

  it('should throw for VoiceRefine (no prompt template)', () => {
    expect(() => getPromptTemplate(OperationType.VoiceRefine)).toThrow(
      /no prompt template/i,
    );
  });

  it('should substitute all {{placeholders}} in renderPrompt', () => {
    const template = getPromptTemplate(OperationType.Rewrite);
    const result = renderPrompt(template, {
      document_context: 'Full document here.',
      selection: 'The selected text.',
      target_tone: 'formal',
      style_profile: 'professional, concise',
    });

    expect(result.user).toContain('Full document here.');
    expect(result.user).toContain('The selected text.');
    expect(result.user).toContain('formal');
    expect(result.user).toContain('professional, concise');
    expect(result.user).not.toContain('{{');
  });

  it('should leave system prompt untouched in renderPrompt', () => {
    const template = getPromptTemplate(OperationType.Rewrite);
    const result = renderPrompt(template, {
      document_context: 'ctx',
      selection: 'sel',
      target_tone: 'casual',
      style_profile: 'relaxed',
    });

    expect(result.system).toBe(template.system);
  });
});
