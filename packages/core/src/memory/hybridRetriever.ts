import type { BM25Index } from './bm25.js';
import type { VectorIndex } from './vectorIndex.js';

export interface HybridWeights {
  vectorWeight: number;
  bm25Weight: number;
}

export interface HybridResult {
  id: string;
  score: number;
}

export class HybridRetriever {
  constructor(
    private readonly bm25: BM25Index,
    private readonly vector: VectorIndex,
    private readonly weights: HybridWeights,
  ) {}

  async search(query: string, queryEmbedding: number[], limit = 10): Promise<HybridResult[]> {
    // Run both searches
    const bm25Results = this.bm25.search(query, limit * 2);
    const vectorResults = await this.vector.search(queryEmbedding, limit * 2);

    // Normalize scores to 0-1 range
    const bm25Max = Math.max(...bm25Results.map((r) => r.score), 1);
    const vectorMax = Math.max(...vectorResults.map((r) => r.score), 1);

    // Merge into a map: id -> combined score
    const combined = new Map<string, number>();

    for (const r of bm25Results) {
      const normalized = r.score / bm25Max;
      combined.set(r.id, (combined.get(r.id) ?? 0) + normalized * this.weights.bm25Weight);
    }

    for (const r of vectorResults) {
      const normalized = r.score / vectorMax;
      combined.set(r.id, (combined.get(r.id) ?? 0) + normalized * this.weights.vectorWeight);
    }

    // Sort by combined score
    const results: HybridResult[] = [...combined.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }
}
