import { randomUUID } from 'node:crypto';

export interface MemoryEntry {
  id: string;
  content: string;
  source: 'conversation' | 'manual' | 'import';
  userId: string;
  sessionId?: string;
  tags: string[];
  importance: number;     // 0-1, higher = more important
  createdAt: number;      // epoch ms
  updatedAt: number;
  accessCount: number;
  embedding?: number[];   // populated by VectorIndex
}

export interface MemorySearchResult {
  entry: MemoryEntry;
  score: number;          // relevance score after decay + weighting
  source: 'bm25' | 'vector' | 'hybrid';
}

export interface CreateMemoryInput {
  content: string;
  source: MemoryEntry['source'];
  userId: string;
  sessionId?: string;
  tags?: string[];
  importance?: number;
}

export function createMemoryEntry(input: CreateMemoryInput): MemoryEntry {
  const now = Date.now();
  return {
    id: randomUUID(),
    content: input.content,
    source: input.source,
    userId: input.userId,
    sessionId: input.sessionId,
    tags: input.tags ?? [],
    importance: input.importance ?? 0.5,
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
  };
}

/**
 * Compute time-decayed relevance score.
 * Uses 30-day half-life with access-count boost.
 * Formula: baseScore * 2^(-ageDays/30) * (1 + log2(1 + accessCount) * 0.1)
 */
export function computeDecayedScore(
  baseScore: number,
  createdAt: number,
  now: number,
  accessCount: number,
): number {
  const ageDays = (now - createdAt) / (24 * 60 * 60 * 1000);
  const halfLife = 30;
  const decay = Math.pow(2, -ageDays / halfLife);
  const accessBoost = 1 + Math.log2(1 + accessCount) * 0.1;
  return baseScore * decay * accessBoost;
}
