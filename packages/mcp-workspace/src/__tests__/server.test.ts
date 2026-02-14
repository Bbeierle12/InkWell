import { describe, it, expect } from 'vitest';
import { createMCPServer } from '../server';

describe('MCP Server', () => {
  it('should return an McpServer instance', () => {
    const server = createMCPServer();
    expect(server).toBeDefined();
    expect(server).toHaveProperty('server'); // McpServer has a .server property (the underlying Server)
    expect(server).toHaveProperty('connect'); // McpServer has connect method
  });

  it('should register 4 tools', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

    const server = createMCPServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.listTools();
    expect(result.tools).toHaveLength(4);

    await client.close();
    await server.close();
  });

  it('should include workspace-search tool', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

    const server = createMCPServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.listTools();
    const toolNames = result.tools.map(t => t.name);
    expect(toolNames).toContain('workspace-search');

    await client.close();
    await server.close();
  });

  it('should include document-analyze tool', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

    const server = createMCPServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.listTools();
    const toolNames = result.tools.map(t => t.name);
    expect(toolNames).toContain('document-analyze');

    await client.close();
    await server.close();
  });

  it('should accept config parameter', () => {
    const server = createMCPServer({ dbPath: ':memory:', watchDirectories: ['/tmp'] });
    expect(server).toBeDefined();
  });
});
