import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '../../test-setup';
import { OllamaClient, OllamaAPIError } from '../client';

/**
 * Helper: Build an Ollama NDJSON streaming response body.
 * Each object is a line in the newline-delimited JSON stream.
 */
function buildNDJSONBody(
  objects: Array<Record<string, unknown>>,
): string {
  return objects.map((o) => JSON.stringify(o)).join('\n') + '\n';
}

const BASE_URL = 'http://localhost:11434';

describe('OllamaClient', () => {
  describe('stream()', () => {
    it('should yield text deltas from streaming response', async () => {
      mswServer.use(
        http.post(`${BASE_URL}/api/chat`, () => {
          const body = buildNDJSONBody([
            { message: { role: 'assistant', content: 'Hello' }, done: false },
            { message: { role: 'assistant', content: ' world' }, done: false },
            { message: { role: 'assistant', content: '!' }, done: false },
            { message: { role: 'assistant', content: '' }, done: true },
          ]);

          return new HttpResponse(body, {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' },
          });
        }),
      );

      const client = new OllamaClient({ baseUrl: BASE_URL, model: 'llama3.2' });
      const chunks: string[] = [];
      for await (const chunk of client.stream([{ role: 'user', content: 'Hi' }])) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' world', '!']);
      expect(chunks.join('')).toBe('Hello world!');
    });

    it('should prepend system message to messages array', async () => {
      let capturedBody: Record<string, unknown> | null = null;

      mswServer.use(
        http.post(`${BASE_URL}/api/chat`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;

          const body = buildNDJSONBody([
            { message: { role: 'assistant', content: 'OK' }, done: false },
            { message: { role: 'assistant', content: '' }, done: true },
          ]);

          return new HttpResponse(body, {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' },
          });
        }),
      );

      const client = new OllamaClient({ baseUrl: BASE_URL, model: 'llama3.2' });
      const chunks: string[] = [];
      for await (const chunk of client.stream(
        [{ role: 'user', content: 'Hello' }],
        { system: 'You are helpful.' },
      )) {
        chunks.push(chunk);
      }

      expect(capturedBody).not.toBeNull();
      const messages = capturedBody!.messages as Array<{ role: string; content: string }>;
      expect(messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
      expect(messages[1]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('should map maxTokens to num_predict option', async () => {
      let capturedBody: Record<string, unknown> | null = null;

      mswServer.use(
        http.post(`${BASE_URL}/api/chat`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;

          const body = buildNDJSONBody([
            { message: { role: 'assistant', content: 'OK' }, done: true },
          ]);

          return new HttpResponse(body, {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' },
          });
        }),
      );

      const client = new OllamaClient({ baseUrl: BASE_URL, model: 'llama3.2' });
      const chunks: string[] = [];
      for await (const chunk of client.stream(
        [{ role: 'user', content: 'Hi' }],
        { maxTokens: 2048 },
      )) {
        chunks.push(chunk);
      }

      expect(capturedBody).not.toBeNull();
      const options = capturedBody!.options as Record<string, unknown>;
      expect(options.num_predict).toBe(2048);
    });

    it('should propagate abort signal and stop yielding', async () => {
      mswServer.use(
        http.post(`${BASE_URL}/api/chat`, () => {
          const body = buildNDJSONBody([
            { message: { role: 'assistant', content: 'First' }, done: false },
            { message: { role: 'assistant', content: ' Second' }, done: false },
            { message: { role: 'assistant', content: ' Third' }, done: false },
            { message: { role: 'assistant', content: '' }, done: true },
          ]);

          return new HttpResponse(body, {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' },
          });
        }),
      );

      const controller = new AbortController();
      const client = new OllamaClient({ baseUrl: BASE_URL, model: 'llama3.2' });

      const chunks: string[] = [];
      for await (const chunk of client.stream(
        [{ role: 'user', content: 'Test' }],
        { signal: controller.signal },
      )) {
        chunks.push(chunk);
        if (chunks.length === 1) {
          controller.abort();
        }
      }

      expect(chunks.length).toBeLessThanOrEqual(2);
      expect(chunks[0]).toBe('First');
    });

    it('should throw OllamaAPIError on non-OK response', async () => {
      mswServer.use(
        http.post(`${BASE_URL}/api/chat`, () => {
          return HttpResponse.json(
            { error: 'model "missing" not found' },
            { status: 404 },
          );
        }),
      );

      const client = new OllamaClient({ baseUrl: BASE_URL, model: 'missing' });

      await expect(async () => {
        for await (const _chunk of client.stream([{ role: 'user', content: 'Hi' }])) {
          // consume
        }
      }).rejects.toThrow(OllamaAPIError);
    });

    it('should throw OllamaAPIError on stream error object', async () => {
      mswServer.use(
        http.post(`${BASE_URL}/api/chat`, () => {
          const body = buildNDJSONBody([
            { message: { role: 'assistant', content: 'Hello' }, done: false },
            { error: 'out of memory' },
          ]);

          return new HttpResponse(body, {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' },
          });
        }),
      );

      const client = new OllamaClient({ baseUrl: BASE_URL, model: 'llama3.2' });

      await expect(async () => {
        for await (const _chunk of client.stream([{ role: 'user', content: 'Hi' }])) {
          // consume
        }
      }).rejects.toThrow(OllamaAPIError);
    });

    it('should send correct model and stream fields in request', async () => {
      let capturedBody: Record<string, unknown> | null = null;

      mswServer.use(
        http.post(`${BASE_URL}/api/chat`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;

          const body = buildNDJSONBody([
            { message: { role: 'assistant', content: 'OK' }, done: true },
          ]);

          return new HttpResponse(body, {
            status: 200,
            headers: { 'content-type': 'application/x-ndjson' },
          });
        }),
      );

      const client = new OllamaClient({ baseUrl: BASE_URL, model: 'llama3.2' });
      for await (const _chunk of client.stream([{ role: 'user', content: 'Hi' }])) {
        // consume
      }

      expect(capturedBody).not.toBeNull();
      expect(capturedBody!.model).toBe('llama3.2');
      expect(capturedBody!.stream).toBe(true);
    });
  });

  describe('listModels()', () => {
    it('should return models from /api/tags', async () => {
      mswServer.use(
        http.get(`${BASE_URL}/api/tags`, () => {
          return HttpResponse.json({
            models: [
              {
                name: 'llama3.2:latest',
                modified_at: '2024-01-15T00:00:00Z',
                size: 4_000_000_000,
                digest: 'abc123',
              },
              {
                name: 'mistral:latest',
                modified_at: '2024-01-14T00:00:00Z',
                size: 3_000_000_000,
                digest: 'def456',
              },
            ],
          });
        }),
      );

      const models = await OllamaClient.listModels(BASE_URL);

      expect(models).toHaveLength(2);
      expect(models[0].name).toBe('llama3.2:latest');
      expect(models[1].name).toBe('mistral:latest');
    });

    it('should return empty array when no models', async () => {
      mswServer.use(
        http.get(`${BASE_URL}/api/tags`, () => {
          return HttpResponse.json({ models: [] });
        }),
      );

      const models = await OllamaClient.listModels(BASE_URL);
      expect(models).toEqual([]);
    });

    it('should throw OllamaAPIError on failure', async () => {
      mswServer.use(
        http.get(`${BASE_URL}/api/tags`, () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      await expect(OllamaClient.listModels(BASE_URL)).rejects.toThrow(OllamaAPIError);
    });
  });

  describe('checkHealth()', () => {
    it('should return true when server is healthy', async () => {
      mswServer.use(
        http.get(`${BASE_URL}/api/tags`, () => {
          return HttpResponse.json({ models: [] });
        }),
      );

      const healthy = await OllamaClient.checkHealth(BASE_URL);
      expect(healthy).toBe(true);
    });

    it('should return false when server returns error', async () => {
      mswServer.use(
        http.get(`${BASE_URL}/api/tags`, () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const healthy = await OllamaClient.checkHealth(BASE_URL);
      expect(healthy).toBe(false);
    });

    it('should return false when server is unreachable', async () => {
      mswServer.use(
        http.get(`${BASE_URL}/api/tags`, () => {
          return HttpResponse.error();
        }),
      );

      const healthy = await OllamaClient.checkHealth(BASE_URL);
      expect(healthy).toBe(false);
    });
  });
});
