import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '../../test-setup';
import { estimateTokens, countTokens } from '../token-counter';

describe('Token Counter', () => {
  it('should estimate tokens using 4 chars/token heuristic', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('abc')).toBe(1); // ceil(3/4) = 1
    expect(estimateTokens('abcde')).toBe(2); // ceil(5/4) = 2
  });

  it('should call /v1/messages/count_tokens API', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages/count_tokens', async () => {
        return HttpResponse.json({ input_tokens: 42 });
      }),
    );

    const result = await countTokens('Hello world, this is a test.', 'test-key');
    expect(result).toBe(42);
  });

  it('should fall back to heuristic on API error', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages/count_tokens', async () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const text = 'Hello world test';
    const result = await countTokens(text, 'test-key');
    expect(result).toBe(estimateTokens(text));
  });

  it('should produce heuristic within reasonable range of API count', async () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const apiCount = 10;

    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages/count_tokens', async () => {
        return HttpResponse.json({ input_tokens: apiCount });
      }),
    );

    const heuristic = estimateTokens(text);
    const apiResult = await countTokens(text, 'test-key');

    expect(apiResult).toBe(apiCount);
    // Heuristic should be in the same order of magnitude
    expect(heuristic).toBeGreaterThan(0);
    expect(heuristic).toBeLessThan(apiCount * 5);
  });
});
