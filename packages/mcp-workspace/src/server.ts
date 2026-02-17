/**
 * MCP Server Entrypoint
 *
 * Registers tools and starts the MCP server.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { z } from 'zod';
import type { MCPServerConfig } from '@inkwell/shared';
import { WorkspaceIndexer } from './indexer/workspace-indexer';
import { workspaceSearch } from './tools/workspace-search';
import { workspaceWatch } from './tools/workspace-watch';
import { documentAnalyze } from './tools/document-analyze';
import { documentStyleGuide } from './tools/document-style-guide';

const DEFAULT_DB_PATH = ':memory:';
const MAX_INDEXABLE_FILE_BYTES = 2 * 1024 * 1024;
const INDEXABLE_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.tsx',
  '.ts',
  '.js',
  '.jsx',
  '.json',
  '.yml',
  '.yaml',
]);

function isIndexablePath(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return INDEXABLE_EXTENSIONS.has(ext);
}

async function indexPathRecursive(indexer: WorkspaceIndexer, path: string): Promise<void> {
  const fileStat = await stat(path);

  if (fileStat.isDirectory()) {
    const entries = await readdir(path, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const next = join(path, entry.name);
        try {
          await indexPathRecursive(indexer, next);
        } catch {
          // Ignore unreadable files/dirs during indexing sweep.
        }
      }),
    );
    return;
  }

  if (!fileStat.isFile()) {
    return;
  }
  if (!isIndexablePath(path)) {
    return;
  }
  if (fileStat.size > MAX_INDEXABLE_FILE_BYTES) {
    return;
  }

  const content = await readFile(path, 'utf-8');
  await indexer.indexDocument(path, content);
}

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
  const indexer = new WorkspaceIndexer();
  let initializePromise: Promise<void> | null = null;

  const ensureIndexerInitialized = async (): Promise<void> => {
    if (!initializePromise) {
      initializePromise = indexer.initialize(
        config?.dbPath ?? DEFAULT_DB_PATH,
        config?.watchDirectories,
      );
    }
    await initializePromise;
  };

  // workspace-search: semantic search over the workspace index
  server.registerTool('workspace-search', {
    description: 'Search the workspace for documents matching a query',
    inputSchema: {
      query: z.string().describe('Search query text'),
      limit: z.number().optional().describe('Maximum results to return'),
    },
  }, async (args) => {
    await ensureIndexerInitialized();
    const limit = Math.max(1, args.limit ?? 10);
    const results = await workspaceSearch(args.query, limit, undefined, indexer);
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
    await ensureIndexerInitialized();

    workspaceWatch(args.patterns, undefined, (path) => {
      void indexPathRecursive(indexer, path).catch(() => {
        // Ignore transient file watcher errors.
      });
    });

    await Promise.all(
      args.patterns.map(async (pattern) => {
        try {
          await indexPathRecursive(indexer, pattern);
        } catch {
          // Ignore invalid watch paths in initial sweep.
        }
      }),
    );

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
