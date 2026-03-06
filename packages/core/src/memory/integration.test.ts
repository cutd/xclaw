import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from './store.js';
import { BM25Index } from './bm25.js';
import { HybridRetriever } from './hybridRetriever.js';
import { MemoryManager } from './manager.js';

// Stub vector index that returns nothing — avoids LanceDB native dep in integration tests
const createStubVector = () => ({
  initialize: async () => {},
  add: async () => {},
  remove: async () => {},
  search: async () => [],
});

describe('Memory Integration', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'xclaw-mem-int-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should store and retrieve via BM25 (no vector)', async () => {
    const store = new MemoryStore(testDir);
    const bm25 = new BM25Index();
    const stubVector = createStubVector();
    const retriever = new HybridRetriever(bm25, stubVector as any, { vectorWeight: 0.7, bm25Weight: 0.3 });
    const manager = new MemoryManager({ store, bm25, vectorIndex: stubVector as any, retriever });

    await manager.initialize();

    await manager.store({
      content: 'User prefers TypeScript over JavaScript',
      source: 'conversation',
      userId: 'user-1',
      tags: ['preference', 'language'],
    });

    await manager.store({
      content: 'Project deadline is end of March',
      source: 'conversation',
      userId: 'user-1',
      tags: ['project'],
    });

    const results = await manager.retrieve('TypeScript preference');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.content).toContain('TypeScript');
  });

  it('should persist to MEMORY.md', async () => {
    const store = new MemoryStore(testDir);
    const bm25 = new BM25Index();
    const stubVector = createStubVector();
    const retriever = new HybridRetriever(bm25, stubVector as any, { vectorWeight: 0.7, bm25Weight: 0.3 });
    const manager = new MemoryManager({ store, bm25, vectorIndex: stubVector as any, retriever });

    await manager.initialize();

    await manager.store({
      content: 'Important architectural decision',
      source: 'manual',
      userId: 'user-1',
      tags: ['architecture'],
    });

    const content = await readFile(join(testDir, 'MEMORY.md'), 'utf-8');
    expect(content).toContain('Important architectural decision');
    expect(content).toContain('architecture');
  });

  it('should write daily logs', async () => {
    const store = new MemoryStore(testDir);
    const bm25 = new BM25Index();
    const stubVector = createStubVector();
    const retriever = new HybridRetriever(bm25, stubVector as any, { vectorWeight: 0.7, bm25Weight: 0.3 });
    const manager = new MemoryManager({ store, bm25, vectorIndex: stubVector as any, retriever });

    await manager.initialize();
    await manager.storeDailyLog('Discussed memory system design.');

    const date = new Date().toISOString().split('T')[0];
    const logContent = await readFile(join(testDir, `${date}.md`), 'utf-8');
    expect(logContent).toContain('memory system design');
  });

  it('should rebuild index from existing MEMORY.md on initialize', async () => {
    // Create a pre-existing MEMORY.md
    const store = new MemoryStore(testDir);
    const bm25First = new BM25Index();
    const stubVector = createStubVector();
    const retriever1 = new HybridRetriever(bm25First, stubVector as any, { vectorWeight: 0.7, bm25Weight: 0.3 });
    const manager1 = new MemoryManager({ store, bm25: bm25First, vectorIndex: stubVector as any, retriever: retriever1 });

    await manager1.initialize();
    await manager1.store({
      content: 'Pre-existing memory about Rust',
      source: 'manual',
      userId: 'user-1',
      tags: ['language'],
    });

    // Create a new manager — should rebuild from MEMORY.md
    const store2 = new MemoryStore(testDir);
    const bm25Second = new BM25Index();
    const retriever2 = new HybridRetriever(bm25Second, stubVector as any, { vectorWeight: 0.7, bm25Weight: 0.3 });
    const manager2 = new MemoryManager({ store: store2, bm25: bm25Second, vectorIndex: stubVector as any, retriever: retriever2 });

    await manager2.initialize();

    const results = await manager2.retrieve('Rust');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.content).toContain('Rust');
  });
});
