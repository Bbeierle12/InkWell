import { describe, it, expect, vi } from 'vitest';
import { DocumentAIServiceImpl } from '../service';
import { OperationType, ModelTarget } from '@inkwell/shared';
import type { LocalInferenceProvider } from '../types';

describe('DocumentAIServiceImpl with LocalInferenceProvider', () => {
  function createMockProvider(overrides?: Partial<LocalInferenceProvider>): LocalInferenceProvider {
    return {
      isAvailable: vi.fn().mockReturnValue(true),
      generate: vi.fn().mockResolvedValue({ text: 'local suggestion' }),
      generateStream: vi.fn().mockResolvedValue({ text: 'streamed suggestion' }),
      ...overrides,
    };
  }

  it('should delegate Local target to localProvider when available', async () => {
    const provider = createMockProvider();
    const service = new DocumentAIServiceImpl({
      apiKey: 'test-key',
      localProvider: provider,
    });

    const result = await service.executeOperation({
      operation: OperationType.InlineSuggest,
      docContent: 'Hello world',
      cursorPos: 11,
    });

    expect(result.model).toBe(ModelTarget.Local);
    expect(result.raw).toBe('local suggestion');
    expect(provider.generate).toHaveBeenCalledOnce();
    expect(provider.isAvailable).toHaveBeenCalled();
  });

  it('should return empty when localProvider is not available', async () => {
    const provider = createMockProvider({
      isAvailable: vi.fn().mockReturnValue(false),
    });
    const service = new DocumentAIServiceImpl({
      apiKey: 'test-key',
      localProvider: provider,
    });

    const result = await service.executeOperation({
      operation: OperationType.InlineSuggest,
      docContent: 'Hello world',
      cursorPos: 11,
    });

    expect(result.model).toBe(ModelTarget.Local);
    expect(result.raw).toBe('');
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('should return empty when no localProvider is set', async () => {
    const service = new DocumentAIServiceImpl({
      apiKey: 'test-key',
    });

    const result = await service.executeOperation({
      operation: OperationType.InlineSuggest,
      docContent: 'Hello world',
      cursorPos: 11,
    });

    expect(result.model).toBe(ModelTarget.Local);
    expect(result.raw).toBe('');
  });

  it('should return empty when localProvider.generate returns null', async () => {
    const provider = createMockProvider({
      generate: vi.fn().mockResolvedValue(null),
    });
    const service = new DocumentAIServiceImpl({
      apiKey: 'test-key',
      localProvider: provider,
    });

    const result = await service.executeOperation({
      operation: OperationType.InlineSuggest,
      docContent: 'Hello world',
      cursorPos: 11,
    });

    expect(result.model).toBe(ModelTarget.Local);
    expect(result.raw).toBe('');
    expect(provider.generate).toHaveBeenCalled();
  });

  it('should not call localProvider for cloud targets', async () => {
    const provider = createMockProvider();
    // Use a non-private document so Rewrite routes to Sonnet (cloud)
    const service = new DocumentAIServiceImpl({
      apiKey: 'test-key',
      localProvider: provider,
    });

    // Rewrite routes to Sonnet, not Local
    const target = service.route(OperationType.Rewrite);
    expect(target).toBe(ModelTarget.Sonnet);
    // Provider should not have been called since we only called route()
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('should pass context to localProvider.generate', async () => {
    const generate = vi.fn().mockResolvedValue({ text: 'continuation' });
    const provider = createMockProvider({ generate });
    const service = new DocumentAIServiceImpl({
      apiKey: 'test-key',
      localProvider: provider,
    });

    await service.executeOperation({
      operation: OperationType.InlineSuggest,
      docContent: 'Once upon a time',
      cursorPos: 17,
    });

    expect(generate).toHaveBeenCalledOnce();
    const [prompt, maxTokens] = generate.mock.calls[0];
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
    expect(maxTokens).toBe(128);
  });
});
