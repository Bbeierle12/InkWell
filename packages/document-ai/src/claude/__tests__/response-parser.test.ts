import { describe, it, expect } from 'vitest';
import { parseAIResponse, collectAndParse } from '../response-parser';

describe('Response Parser', () => {
  it('should parse a valid JSON array of AIEditInstructions', () => {
    const json = JSON.stringify([
      { type: 'replace', range: { from: 0, to: 10 }, content: 'Hello world' },
      { type: 'insert', range: { from: 15, to: 15 }, content: ' extra' },
    ]);

    const result = parseAIResponse(json);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('replace');
    expect(result[0].content).toBe('Hello world');
    expect(result[1].type).toBe('insert');
  });

  it('should return [] for invalid JSON', () => {
    const result = parseAIResponse('not valid json {{{');
    expect(result).toEqual([]);
  });

  it('should return [] for non-array JSON (object)', () => {
    const result = parseAIResponse('{"type": "replace", "range": {"from": 0, "to": 5}, "content": "hi"}');
    expect(result).toEqual([]);
  });

  it('should extract and parse JSON from markdown code fences', () => {
    const fenced = '```json\n[{"type": "replace", "range": {"from": 0, "to": 5}, "content": "hello"}]\n```';
    const result = parseAIResponse(fenced);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('hello');
  });

  it('should return [] for instructions with invalid types', () => {
    const json = JSON.stringify([
      { type: 'unknown_type', range: { from: 0, to: 5 }, content: 'hello' },
    ]);
    const result = parseAIResponse(json);
    expect(result).toEqual([]);
  });

  it('should collect from async generator and parse', async () => {
    async function* mockStream(): AsyncGenerator<string, void, unknown> {
      yield '[{"type": "replace"';
      yield ', "range": {"from": 0, "to": 10}';
      yield ', "content": "Hello world"}]';
    }

    const { raw, instructions } = await collectAndParse(mockStream());
    expect(raw).toBe('[{"type": "replace", "range": {"from": 0, "to": 10}, "content": "Hello world"}]');
    expect(instructions).toHaveLength(1);
    expect(instructions[0].content).toBe('Hello world');
  });
});
