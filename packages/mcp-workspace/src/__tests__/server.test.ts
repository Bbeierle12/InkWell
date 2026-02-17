import { describe, it, expect } from 'vitest';
import { createMCPServer } from '../server';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

type TextContent = { type: 'text'; text: string };

function isTextContent(value: unknown): value is TextContent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.type === 'text' && typeof record.text === 'string';
}

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

  it('indexes watched paths and returns workspace-search results', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');

    const tempDir = await mkdtemp(join(tmpdir(), 'inkwell-mcp-'));
    const filePath = join(tempDir, 'notes.md');
    await writeFile(filePath, 'The ancient oaks are part of local folklore.');

    const server = createMCPServer({ dbPath: ':memory:' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    await client.callTool({
      name: 'workspace-watch',
      arguments: { patterns: [tempDir] },
    });

    const searchResult = await client.callTool({
      name: 'workspace-search',
      arguments: { query: 'ancient oaks', limit: 5 },
    });
    const content = Array.isArray(searchResult.content) ? searchResult.content : [];
    const text = content.find(isTextContent)?.text ?? '[]';
    const parsed = JSON.parse(text) as Array<{ content: string }>;
    expect(parsed.some((row) => row.content.includes('ancient oaks'))).toBe(true);

    await client.close();
    await server.close();
    await rm(tempDir, { recursive: true, force: true });
  });
});
