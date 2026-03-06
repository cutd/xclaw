import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryManager } from './manager.js';
import type { MemoryStore } from './store.js';
import type { BM25Index } from './bm25.js';
import type { VectorIndex } from './vectorIndex.js';
import type { HybridRetriever } from './hybridRetriever.js';

describe('MemoryManager', () => {
  let mockStore: MemoryStore;
  let mockBm25: BM25Index;
  let mockVector: VectorIndex;
  let mockRetriever: HybridRetriever;

  beforeEach(() => {
    mockStore = {
      initialize: vi.fn(),
      append: vi.fn(),
      readAll: vi.fn().mockResolvedValue([]),
      writeDailyLog: vi.fn(),
    } as unknown as MemoryStore;

    mockBm25 = {
      add: vi.fn(),
      remove: vi.fn(),
      search: vi.fn().mockReturnValue([]),
    } as unknown as BM25Index;

    mockVector = {
      initialize: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      search: vi.fn().mockResolvedValue([]),
    } as unknown as VectorIndex;

    mockRetriever = {
      search: vi.fn().mockResolvedValue([]),
    } as unknown as HybridRetriever;
  });

  it('should store a memory and index it', async () => {
    const manager = new MemoryManager({
      store: mockStore,
      bm25: mockBm25,
      vectorIndex: mockVector,
      retriever: mockRetriever,
    });

    await manager.store({
      content: 'User prefers dark mode',
      source: 'conversation',
      userId: 'user-1',
      tags: ['preference'],
    });

    expect(mockStore.append).toHaveBeenCalledOnce();
    expect(mockBm25.add).toHaveBeenCalledOnce();
  });

  it('should retrieve memories via hybrid search', async () => {
    vi.mocked(mockRetriever.search).mockResolvedValue([
      { id: '1', score: 0.8 },
    ]);

    const manager = new MemoryManager({
      store: mockStore,
      bm25: mockBm25,
      vectorIndex: mockVector,
      retriever: mockRetriever,
    });

    const results = await manager.retrieve('dark mode', 5);
    expect(mockRetriever.search).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1);
  });

  it('should write daily log on storeDailyLog', async () => {
    const manager = new MemoryManager({
      store: mockStore,
      bm25: mockBm25,
      vectorIndex: mockVector,
      retriever: mockRetriever,
    });

    await manager.storeDailyLog('Discussed architecture decisions.');
    expect(mockStore.writeDailyLog).toHaveBeenCalledOnce();
  });

  it('should build index from existing store entries on initialize', async () => {
    vi.mocked(mockStore.readAll).mockResolvedValue([
      { content: 'Entry 1', tags: ['a'], timestamp: Date.now() },
      { content: 'Entry 2', tags: ['b'], timestamp: Date.now() },
    ]);

    const manager = new MemoryManager({
      store: mockStore,
      bm25: mockBm25,
      vectorIndex: mockVector,
      retriever: mockRetriever,
    });

    await manager.initialize();
    expect(mockStore.initialize).toHaveBeenCalledOnce();
    expect(mockBm25.add).toHaveBeenCalledTimes(2);
  });
});
