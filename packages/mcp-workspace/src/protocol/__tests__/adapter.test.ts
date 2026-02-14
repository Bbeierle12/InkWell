import { describe, it, expect } from 'vitest';
import { MCPAdapter } from '../adapter';

describe('MCPAdapter', () => {
  const adapter = new MCPAdapter();

  it('getVersion() returns "2024-11-05"', () => {
    expect(adapter.getVersion()).toBe('2024-11-05');
  });

  it('version is a valid MCP protocol version string (YYYY-MM-DD format)', () => {
    const version = adapter.getVersion();
    expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('validateRequest: valid JSON-RPC request returns true', () => {
    const valid = { jsonrpc: '2.0', method: 'test', id: 1 };
    expect(adapter.validateRequest(valid)).toBe(true);
  });

  it('validateRequest: missing jsonrpc returns false', () => {
    const noJsonrpc = { method: 'test', id: 1 };
    expect(adapter.validateRequest(noJsonrpc)).toBe(false);
  });

  it('validateRequest: missing method returns false', () => {
    const noMethod = { jsonrpc: '2.0', id: 1 };
    expect(adapter.validateRequest(noMethod)).toBe(false);

    const emptyMethod = { jsonrpc: '2.0', method: '', id: 1 };
    expect(adapter.validateRequest(emptyMethod)).toBe(false);
  });

  it('validateRequest: non-object input returns false', () => {
    expect(adapter.validateRequest(null)).toBe(false);
    expect(adapter.validateRequest('string')).toBe(false);
    expect(adapter.validateRequest(42)).toBe(false);
    expect(adapter.validateRequest(undefined)).toBe(false);
  });
});
