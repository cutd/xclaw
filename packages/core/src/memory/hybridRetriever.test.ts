import { describe, it, expect, vi } from 'vitest';
import { HybridRetriever } from './hybridRetriever.js';
import type { BM25Index, BM25Result } from './bm25.js';
import type { VectorIndex, VectorSearchResult } from './vectorIndex.js';

describe('HybridRetriever', () => {
  const mockBm25: BM25Index = {
    search: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
  } as unknown as BM25Index;

  const mockVector: VectorIndex = {
    search: vi.fn(),
    add: vi.fn(),
    remove: vi.fn(),
    initialize: vi.fn(),
  } as unknown as VectorIndex;

  it('should merge BM25 and vector results with 70/30 weighting', async () => {
    vi.mocked(mockBm25.search).mockReturnValue([
      { id: '1', score: 0.8 },
      { id: '2', score: 0.5 },
    ] as BM25Result[]);

    vi.mocked(mockVector.search).mockResolvedValue([
      { id: '1', content: 'TypeScript', score: 0.9 },
      { id: '3', content: 'Rust', score: 0.7 },
    ] as VectorSearchResult[]);

    const retriever = new HybridRetriever(mockBm25, mockVector, { vectorWeight: 0.7, bm25Weight: 0.3 });
    const results = await retriever.search('TypeScript', [0.1, 0.2], 10);

    // Entry 1 appears in both => highest combined score
    expect(results[0].id).toBe('1');
    // All unique entries should be present
    const ids = results.map((r) => r.id);
    expect(ids).toContain('1');
    expect(ids).toContain('2');
    expect(ids).toContain('3');
  });

  it('should work with BM25 only when vector returns empty', async () => {
    vi.mocked(mockBm25.search).mockReturnValue([
      { id: '1', score: 0.8 },
    ] as BM25Result[]);
    vi.mocked(mockVector.search).mockResolvedValue([]);

    const retriever = new HybridRetriever(mockBm25, mockVector, { vectorWeight: 0.7, bm25Weight: 0.3 });
    const results = await retriever.search('test', [0.1], 10);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });

  it('should work with vector only when BM25 returns empty', async () => {
    vi.mocked(mockBm25.search).mockReturnValue([]);
    vi.mocked(mockVector.search).mockResolvedValue([
      { id: '1', content: 'test', score: 0.9 },
    ] as VectorSearchResult[]);

    const retriever = new HybridRetriever(mockBm25, mockVector, { vectorWeight: 0.7, bm25Weight: 0.3 });
    const results = await retriever.search('test', [0.1], 10);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('1');
  });

  it('should respect limit', async () => {
    vi.mocked(mockBm25.search).mockReturnValue([
      { id: '1', score: 0.8 },
      { id: '2', score: 0.7 },
      { id: '3', score: 0.6 },
    ] as BM25Result[]);
    vi.mocked(mockVector.search).mockResolvedValue([]);

    const retriever = new HybridRetriever(mockBm25, mockVector, { vectorWeight: 0.7, bm25Weight: 0.3 });
    const results = await retriever.search('test', [], 2);

    expect(results).toHaveLength(2);
  });
});
