/**
 * MCP Server Entrypoint
 *
 * Registers tools and starts the MCP server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MCPServerConfig } from '@inkwell/shared';
import { workspaceSearch } from './tools/workspace-search';
import { workspaceWatch } from './tools/workspace-watch';
import { documentAnalyze } from './tools/document-analyze';
import { documentStyleGuide } from './tools/document-style-guide';

/**
 * Create and configure the MCP workspace server.
 *
 * Returns an McpServer instance with four registered tools:
 *   workspace-search, workspace-watch, document-analyze, document-style-guide.
 *
 * @param config Optional configuration for database path and watch directories.
 */
export function createMCPServer(config?: MCPServerConfig): McpServer {
  const server = new McpServer({
    name: 'inkwell-workspace',
    version: '0.0.1',
  });

  // workspace-search: semantic search over the workspace index
  server.registerTool('workspace-search', {
    description: 'Search the workspace for documents matching a query',
    inputSchema: {
      query: z.string().describe('Search query text'),
      limit: z.number().optional().describe('Maximum results to return'),
    },
  }, async (args) => {
    const results = await workspaceSearch(args.query, args.limit ?? 10);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(results) }],
    };
  });

  // workspace-watch: start watching directories for changes
  server.registerTool('workspace-watch', {
    description: 'Watch workspace directories for changes',
    inputSchema: {
      patterns: z.array(z.string()).describe('Directory patterns to watch'),
    },
  }, async (args) => {
    workspaceWatch(args.patterns);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Watching ${args.patterns.length} pattern(s)`,
        },
      ],
    };
  });

  // document-analyze: structural analysis of a document
  server.registerTool('document-analyze', {
    description: 'Analyze document structure and content',
    inputSchema: {
      content: z.string().describe('Document content to analyze'),
    },
  }, async (args) => {
    const result = await documentAnalyze(args.content);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  });

  // document-style-guide: extract or apply style guide
  server.registerTool('document-style-guide', {
    description: 'Extract style guide from document',
    inputSchema: {
      content: z.string().describe('Document content to analyze'),
    },
  }, async (args) => {
    const result = await documentStyleGuide(args.content);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  });

  return server;
}
