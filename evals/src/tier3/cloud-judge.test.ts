import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from './test-setup';
import { cloudJudge } from './cloud-judge';

describe('Tier 3 — Cloud Judge (MSW-mocked)', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-key');
  });

  it('should return structured result from mocked Claude response', async () => {
    const result = await cloudJudge(
      'The meeting was productive.',
      'The meeting proved productive, covering key topics.',
      'The meeting proved productive, covering several key strategic topics.',
      'rewrite',
    );

    expect(result.score).toBe(8.5);
    expect(result.reasoning).toBeTruthy();
    expect(result.criteria).toBeDefined();
    expect(typeof result.criteria.tone_preservation).toBe('number');
    expect(result.model).toBe('claude-sonnet-4-5-20250929');
  });

  it('should parse JSON wrapped in markdown code blocks', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        return HttpResponse.json({
          id: 'msg_fenced',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '```json\n{"score": 7.0, "reasoning": "Good output.", "criteria": {"fluency": 7}}\n```',
            },
          ],
          model: 'claude-sonnet-4-5-20250929',
          stop_reason: 'end_turn',
          usage: { input_tokens: 50, output_tokens: 30 },
        });
      }),
    );

    const result = await cloudJudge('input', 'output', 'golden', 'rewrite');
    expect(result.score).toBe(7.0);
    expect(result.criteria.fluency).toBe(7);
  });

  it('should throw on API error (401)', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        return new HttpResponse('{"error": {"type": "authentication_error", "message": "Invalid API key"}}', {
          status: 401,
        });
      }),
    );

    await expect(
      cloudJudge('input', 'output', 'golden', 'rewrite'),
    ).rejects.toThrow('Claude API error (401)');
  });

  it('should throw on unparseable response', async () => {
    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        return HttpResponse.json({
          id: 'msg_bad',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'This is not JSON at all, just plain text without structure.',
            },
          ],
          model: 'claude-sonnet-4-5-20250929',
          stop_reason: 'end_turn',
          usage: { input_tokens: 50, output_tokens: 30 },
        });
      }),
    );

    await expect(
      cloudJudge('input', 'output', 'golden', 'rewrite'),
    ).rejects.toThrow('Failed to parse judge response as JSON');
  });

  it('should throw with descriptive message when API key not set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    await expect(
      cloudJudge('input', 'output', 'golden', 'rewrite'),
    ).rejects.toThrow('ANTHROPIC_API_KEY environment variable is not set');
  });

  it('should send correct request body', async () => {
    let capturedBody: any = null;

    mswServer.use(
      http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: 'msg_capture',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                score: 8,
                reasoning: 'Good.',
                criteria: { tone_preservation: 8 },
              }),
            },
          ],
          model: 'claude-sonnet-4-5-20250929',
          stop_reason: 'end_turn',
          usage: { input_tokens: 50, output_tokens: 30 },
        });
      }),
    );

    await cloudJudge('test input', 'test output', 'test golden', 'rewrite');

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.model).toBe('claude-sonnet-4-5-20250929');
    expect(capturedBody.max_tokens).toBe(1024);
    expect(capturedBody.system).toBeTruthy();
    expect(capturedBody.messages).toHaveLength(1);
    expect(capturedBody.messages[0].role).toBe('user');
    expect(capturedBody.messages[0].content).toContain('test input');
    expect(capturedBody.messages[0].content).toContain('test output');
    expect(capturedBody.messages[0].content).toContain('test golden');
  });
});
