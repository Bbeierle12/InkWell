import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMCPServer } from '../../server';
import { MCPAdapter } from '../adapter';

/**
 * 5.3 MCP Protocol Compliance Tests
 *
 * End-to-end protocol tests using the MCP SDK's Client + InMemoryTransport.
 */
describe('5.3 MCP Protocol Compliance', () => {
  let client: Client | undefined;
  let server: ReturnType<typeof createMCPServer> | undefined;

  afterEach(async () => {
    try {
      if (client) await client.close();
    } catch {
      /* already closed */
    }
    try {
      if (server) await server.close();
    } catch {
      /* already closed */
    }
    client = undefined;
    server = undefined;
  });

  it('should respond with correct protocol version header', () => {
    // Ref: Test Plan §5.3
    const adapter = new MCPAdapter();
    const version = adapter.getVersion();
    expect(version).toBe('2024-11-05');
    // Verify it follows the expected YYYY-MM-DD format
    expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should handle initialize request', async () => {
    // Ref: Test Plan §5.3
    // Create server and transport pair
    server = createMCPServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    // Create client
    client = new Client({ name: 'test-client', version: '1.0.0' });

    // Connect both ends
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    // Verify the client successfully initialized by listing tools (should not throw)
    const result = await client.listTools();
    expect(result).toBeDefined();
    expect(result.tools).toBeDefined();
  });

  it('should register all tools correctly', async () => {
    // Ref: Test Plan §5.3
    server = createMCPServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();

    // Verify exactly 4 tools are registered
    expect(tools).toHaveLength(4);

    // Verify each expected tool name is present
    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toEqual([
      'document-analyze',
      'document-style-guide',
      'workspace-search',
      'workspace-watch',
    ]);

    // Verify each tool has a description and input schema
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('should handle malformed requests gracefully', () => {
    // Ref: Test Plan §5.3
    const adapter = new MCPAdapter();

    // Missing jsonrpc field
    expect(adapter.validateRequest({ method: 'test', id: 1 })).toBe(false);

    // Wrong jsonrpc version
    expect(
      adapter.validateRequest({ jsonrpc: '1.0', method: 'test', id: 1 }),
    ).toBe(false);

    // Missing method field
    expect(adapter.validateRequest({ jsonrpc: '2.0', id: 1 })).toBe(false);

    // Empty method string
    expect(
      adapter.validateRequest({ jsonrpc: '2.0', method: '', id: 1 }),
    ).toBe(false);

    // Non-object inputs
    expect(adapter.validateRequest(null)).toBe(false);
    expect(adapter.validateRequest(undefined)).toBe(false);
    expect(adapter.validateRequest('a string')).toBe(false);
    expect(adapter.validateRequest(42)).toBe(false);
    expect(adapter.validateRequest(true)).toBe(false);

    // Valid request should return true
    expect(
      adapter.validateRequest({ jsonrpc: '2.0', method: 'initialize', id: 1 }),
    ).toBe(true);
    expect(
      adapter.validateRequest({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2,
      }),
    ).toBe(true);
  });
});
