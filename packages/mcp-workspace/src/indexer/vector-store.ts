/**
 * Vector Store
 *
 * SQLite-backed vector storage using the sqlite-vec extension.
 * Falls back to non-vector search when sqlite-vec is unavailable
 * (common on Windows or when native extensions cannot be loaded).
 */

import Database from 'better-sqlite3';

/** Shape of results returned from search queries. */
export interface VectorSearchResult {
  id: string;
  content: string;
  metadata: unknown;
  distance: number | null;
}

export class VectorStore {
  private db: Database.Database | null = null;
  private initialized = false;
  private vecAvailable = false;

  /** Whether the store has been initialized. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Whether the sqlite-vec extension is loaded. */
  get isVecAvailable(): boolean {
    return this.vecAvailable;
  }

  /**
   * Initialize the vector store (create tables if needed).
   *
   * Opens the SQLite database at `dbPath` (use `:memory:` for in-memory),
   * attempts to load the sqlite-vec extension, and creates the required tables.
   * Safe to call multiple times (idempotent).
   */
  async initialize(dbPath: string): Promise<void> {
    // If already initialized with same db, this is a no-op
    if (this.initialized && this.db?.open) {
      return;
    }

    this.db = new Database(dbPath);

    // Attempt to load sqlite-vec extension
    this.vecAvailable = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const sqliteVec = require('sqlite-vec');
      sqliteVec.load(this.db);
      this.vecAvailable = true;
    } catch {
      // sqlite-vec not available — fall back to non-vector search
      this.vecAvailable = false;
    }

    // Create the chunks metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        content TEXT,
        metadata TEXT
      )
    `);

    // Create the vector virtual table if extension is available
    if (this.vecAvailable) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks
          USING vec0(embedding float[384])
        `);
      } catch {
        // If virtual table creation fails, disable vec
        this.vecAvailable = false;
      }
    }

    this.initialized = true;
  }

  /**
   * Insert a chunk with its embedding vector and metadata.
   *
   * @param chunkId  Unique identifier for the chunk.
   * @param vector   Embedding vector (float array, typically 384 dimensions).
   * @param metadata Arbitrary metadata object (will be JSON-serialized).
   * @param content  Optional chunk text content for retrieval (default '').
   */
  async insert(
    chunkId: string,
    vector: number[],
    metadata: unknown,
    content: string = '',
  ): Promise<void> {
    this.ensureInitialized();

    const metadataJson = JSON.stringify(metadata);

    // Insert or replace into the chunks metadata table
    this.db!.prepare(
      'INSERT OR REPLACE INTO chunks (id, content, metadata) VALUES (?, ?, ?)',
    ).run(chunkId, content, metadataJson);

    // Insert into vector table if available
    if (this.vecAvailable) {
      try {
        // sqlite-vec expects the embedding as a JSON array or blob
        const vectorJson = JSON.stringify(vector);
        this.db!.prepare(
          'INSERT OR REPLACE INTO vec_chunks (rowid, embedding) VALUES ((SELECT rowid FROM chunks WHERE id = ?), ?)',
        ).run(chunkId, vectorJson);
      } catch {
        // Vector insertion failed — data is still in chunks table
      }
    }
  }

  /**
   * Search for the nearest chunks to a query vector.
   *
   * When sqlite-vec is available, performs true vector distance search.
   * Otherwise, returns all chunks up to `limit` as a fallback.
   *
   * @param queryVector  The query embedding vector.
   * @param limit        Maximum number of results to return.
   * @returns            Array of search results sorted by distance (if available).
   */
  async search(
    queryVector: number[],
    limit: number,
  ): Promise<VectorSearchResult[]> {
    this.ensureInitialized();

    if (this.vecAvailable) {
      try {
        const vectorJson = JSON.stringify(queryVector);
        const rows = this.db!.prepare(
          `SELECT c.id, c.content, c.metadata, v.distance
           FROM vec_chunks v
           INNER JOIN chunks c ON c.rowid = v.rowid
           WHERE v.embedding MATCH ?
           ORDER BY v.distance
           LIMIT ?`,
        ).all(vectorJson, limit) as Array<{
          id: string;
          content: string;
          metadata: string;
          distance: number;
        }>;

        return rows.map((row) => ({
          id: row.id,
          content: row.content ?? '',
          metadata: JSON.parse(row.metadata),
          distance: row.distance,
        }));
      } catch {
        // Fall through to non-vector fallback
      }
    }

    // Fallback: return all chunks up to limit without distance ranking
    const rows = this.db!.prepare(
      'SELECT id, content, metadata FROM chunks LIMIT ?',
    ).all(limit) as Array<{ id: string; content: string; metadata: string }>;

    return rows.map((row) => ({
      id: row.id,
      content: row.content ?? '',
      metadata: JSON.parse(row.metadata),
      distance: null,
    }));
  }

  /**
   * Remove all chunks that belong to a specific file path.
   */
  async deleteByPath(path: string): Promise<void> {
    this.ensureInitialized();

    const rows = this.db!.prepare(
      'SELECT id, rowid, metadata FROM chunks',
    ).all() as Array<{ id: string; rowid: number; metadata: string }>;

    const toDelete = rows.filter((row) => {
      try {
        const metadata = JSON.parse(row.metadata) as { path?: string };
        return metadata.path === path;
      } catch {
        return false;
      }
    });

    if (toDelete.length === 0) {
      return;
    }

    const deleteChunkStmt = this.db!.prepare('DELETE FROM chunks WHERE id = ?');
    const deleteVecStmt = this.vecAvailable
      ? this.db!.prepare('DELETE FROM vec_chunks WHERE rowid = ?')
      : null;

    for (const row of toDelete) {
      if (deleteVecStmt) {
        deleteVecStmt.run(row.rowid);
      }
      deleteChunkStmt.run(row.id);
    }
  }

  /**
   * Close the database connection and reset state.
   */
  close(): void {
    if (this.db?.open) {
      this.db.close();
    }
    this.db = null;
    this.initialized = false;
    this.vecAvailable = false;
  }

  /**
   * Throw if the store has not been initialized.
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error(
        'VectorStore is not initialized. Call initialize() first.',
      );
    }
  }
}
