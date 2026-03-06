import { createMemoryEntry, type CreateMemoryInput, type MemoryEntry, type MemorySearchResult } from './types.js';
import type { MemoryStore } from './store.js';
import type { BM25Index } from './bm25.js';
import type { VectorIndex } from './vectorIndex.js';
import type { HybridRetriever } from './hybridRetriever.js';

export interface MemoryManagerConfig {
  store: MemoryStore;
  bm25: BM25Index;
  vectorIndex: VectorIndex;
  retriever: HybridRetriever;
  embedFn?: (text: string) => Promise<number[]>;
}

export class MemoryManager {
  private readonly config: MemoryManagerConfig;
  private entries = new Map<string, MemoryEntry>();

  constructor(config: MemoryManagerConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    await this.config.store.initialize();
    await this.config.vectorIndex.initialize();

    // Load existing entries and build index
    const existing = await this.config.store.readAll();
    for (const entry of existing) {
      const memEntry = createMemoryEntry({
        content: entry.content,
        source: 'import',
        userId: 'system',
        tags: entry.tags,
      });
      memEntry.createdAt = entry.timestamp;
      this.entries.set(memEntry.id, memEntry);
      this.config.bm25.add(memEntry.id, memEntry.content);

      if (this.config.embedFn) {
        const embedding = await this.config.embedFn(memEntry.content);
        await this.config.vectorIndex.add(memEntry.id, memEntry.content, embedding);
      }
    }
  }

  async store(input: CreateMemoryInput): Promise<MemoryEntry> {
    const entry = createMemoryEntry(input);
    this.entries.set(entry.id, entry);

    // Persist to Markdown
    await this.config.store.append({
      content: entry.content,
      tags: entry.tags,
      timestamp: entry.createdAt,
    });

    // Index for BM25
    this.config.bm25.add(entry.id, entry.content);

    // Index for vector search if embedding function available
    if (this.config.embedFn) {
      const embedding = await this.config.embedFn(entry.content);
      entry.embedding = embedding;
      await this.config.vectorIndex.add(entry.id, entry.content, embedding);
    }

    return entry;
  }

  async retrieve(query: string, limit = 10): Promise<MemorySearchResult[]> {
    let queryEmbedding: number[] = [];
    if (this.config.embedFn) {
      queryEmbedding = await this.config.embedFn(query);
    }

    const results = await this.config.retriever.search(query, queryEmbedding, limit);

    return results.map((r) => ({
      entry: this.entries.get(r.id) ?? createMemoryEntry({ content: '', source: 'import', userId: 'system' }),
      score: r.score,
      source: 'hybrid' as const,
    }));
  }

  async storeDailyLog(content: string): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    await this.config.store.writeDailyLog(date, content);
  }

  getEntry(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }
}
