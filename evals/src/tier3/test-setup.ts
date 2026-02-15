/**
 * MSW test setup for Tier 3 cloud judge tests.
 *
 * Initializes Mock Service Worker with handlers for api.anthropic.com
 * so tests can run without a real API key.
 */
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { beforeAll, afterAll, afterEach } from 'vitest';

/** Default MSW handlers for Claude API mocking. */
const handlers = [
  http.post('https://api.anthropic.com/v1/messages', () => {
    return HttpResponse.json({
      id: 'msg_eval_test',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            score: 8.5,
            reasoning: 'The output closely matches the golden reference with good quality.',
            criteria: {
              tone_preservation: 8,
              meaning_accuracy: 9,
              fluency: 8.5,
              conciseness: 8.5,
              style_match: 8,
            },
          }),
        },
      ],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
  }),
];

export const mswServer = setupServer(...handlers);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
