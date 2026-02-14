/**
 * @inkwell/mcp-workspace — MCP context server for Inkwell.
 *
 * Provides workspace search, file watching, document analysis,
 * and style guide tools via the Model Context Protocol.
 */

export { createMCPServer } from './server';
export { chunkDocument, type Chunk } from './indexer/chunker';
export { VectorStore, type VectorSearchResult } from './indexer/vector-store';
export { FileWatcher } from './indexer/file-watcher';
export { MCPAdapter } from './protocol/adapter';
export { workspaceSearch } from './tools/workspace-search';
export { workspaceWatch } from './tools/workspace-watch';
export { documentAnalyze } from './tools/document-analyze';
export { documentStyleGuide } from './tools/document-style-guide';
