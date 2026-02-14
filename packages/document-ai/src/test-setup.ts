/**
 * MSW test setup for document-ai tests.
 *
 * Initializes Mock Service Worker with handlers for api.anthropic.com
 * and registers the privacy canary interceptor.
 */
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { PRIVACY_CANARY } from '@inkwell/shared';
import { beforeAll, afterAll, afterEach } from 'vitest';

/** Default MSW handlers for Claude API mocking. */
const handlers = [
  http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
    const body = await request.text();

    // Privacy canary interceptor: fatal error if private content leaks
    if (body.includes(PRIVACY_CANARY)) {
      throw new Error(
        `FATAL: Privacy canary detected in outgoing request! ` +
        `Content marked as private was transmitted to the cloud API.`,
      );
    }

    // Default: return a generic success response (overridden per test via VCR fixtures)
    return HttpResponse.json({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'mock response' }],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  }),
];

export const mswServer = setupServer(...handlers);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());
