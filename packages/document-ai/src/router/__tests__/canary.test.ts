import { PRIVACY_CANARY, OperationType } from '@inkwell/shared';

/**
 * 2.1 Privacy Canary Tests
 *
 * Verifies that the MSW privacy canary interceptor catches any request
 * containing the canary string before it reaches the cloud API.
 *
 * When the MSW handler throws on canary detection, the fetch resolves
 * with a 500 "Unhandled Exception" response whose body contains the
 * error message. We assert on that behavior.
 *
 * Invariant: private-docs-never-reach-cloud
 */

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';

/** Build a minimal Claude API request body. */
function buildRequestBody(content: string): string {
  return JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [{ role: 'user', content }],
  });
}

/**
 * Assert that a fetch containing the canary is intercepted by MSW.
 * MSW v2 converts handler throws into 500 responses with the error
 * serialized in the body.
 */
async function expectCanaryBlocked(body: string): Promise<void> {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  expect(response.status).toBe(500);
  expect(response.statusText).toBe('Unhandled Exception');

  const text = await response.text();
  expect(text).toContain('Privacy canary detected');
}

describe('2.1 Privacy Canary', () => {
  // ── Canary blocks request ───────────────────────────────────────

  it('should block requests containing the canary string', async () => {
    // Invariant: private-docs-never-reach-cloud
    const body = buildRequestBody(
      `Please rewrite this: ${PRIVACY_CANARY} some private text`,
    );

    await expectCanaryBlocked(body);
  });

  // ── Normal request passes ─────────────────────────────────────

  it('should allow requests without the canary string', async () => {
    const body = buildRequestBody('Please rewrite this normal text.');

    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.id).toBe('msg_test');
    expect(json.content[0].text).toBe('mock response');
  });

  // ── Canary in nested content ──────────────────────────────────

  it('should catch canary string embedded in nested JSON content', async () => {
    // Invariant: private-docs-never-reach-cloud
    const body = JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Here is a document section with ${PRIVACY_CANARY} embedded deep inside.`,
            },
          ],
        },
      ],
      metadata: {
        document: {
          sections: [
            { title: 'Chapter 1', body: `Contains ${PRIVACY_CANARY} data` },
          ],
        },
      },
    });

    await expectCanaryBlocked(body);
  });

  // ── All operation types with canary ───────────────────────────

  describe('should detect canary across all operation types', () => {
    const operations = Object.values(OperationType);

    for (const operation of operations) {
      it(`should catch canary in ${operation} request payload`, async () => {
        // Invariant: private-docs-never-reach-cloud
        // Simulate a request that includes the operation type and canary content
        const body = JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: `[operation:${operation}] Process this content: ${PRIVACY_CANARY}`,
            },
          ],
        });

        await expectCanaryBlocked(body);
      });
    }
  });

  // ── Canary substring safety ───────────────────────────────────

  it('should not false-positive on partial canary substrings', async () => {
    // Only the exact canary string should trigger, not fragments
    const body = buildRequestBody('CANARY some text DO_NOT_TRANSMIT');

    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });
});
