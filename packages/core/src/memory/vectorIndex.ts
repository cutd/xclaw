import * as lancedb from '@lancedb/lancedb';

export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
}

const TABLE_NAME = 'memories';

export class VectorIndex {
  private readonly dbPath: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    this.db = await lancedb.connect(this.dbPath);
    try {
      this.table = await this.db.openTable(TABLE_NAME);
    } catch {
      // Table doesn't exist yet — will be created on first add
      this.table = null;
    }
  }

  async add(id: string, content: string, embedding: number[]): Promise<void> {
    if (!this.db) throw new Error('VectorIndex not initialized');

    const row = { id, content, vector: embedding };

    if (!this.table) {
      this.table = await this.db.createTable(TABLE_NAME, [row]);
    } else {
      await this.table.add([row]);
    }
  }

  async search(queryEmbedding: number[], limit = 10): Promise<VectorSearchResult[]> {
    if (!this.table) return [];

    try {
      const results = await this.table
        .vectorSearch(queryEmbedding)
        .limit(limit)
        .toArray();

      return results.map((row) => ({
        id: row.id as string,
        content: row.content as string,
        score: 1 / (1 + (row._distance as number)), // convert distance to similarity score
      }));
    } catch {
      return [];
    }
  }

  async remove(id: string): Promise<void> {
    if (!this.table) return;
    await this.table.delete(`id = '${id}'`);
    // Check if table is now empty
    const count = await this.table.countRows();
    if (count === 0) {
      this.table = null;
    }
  }
}
