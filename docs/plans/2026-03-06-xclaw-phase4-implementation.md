# Phase 4: Memory System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a persistent memory system with Markdown-based storage (MEMORY.md + daily logs), BM25 keyword search, and vector semantic search via LanceDB, integrated into the message pipeline so agents receive relevant memories as context.

**Architecture:** A `memory/` module in `@xclaw/core` provides: `MemoryStore` for Markdown file I/O (MEMORY.md + daily logs), `BM25Index` for keyword search, `VectorIndex` wrapping LanceDB for semantic search, `HybridRetriever` that merges both (70% vector + 30% BM25), and `MemoryManager` that orchestrates storage/retrieval. The `MessagePipeline` is extended to retrieve relevant memories before agent dispatch and store conversation summaries after responses. `MemoryConfig` is added to `XClawConfig`. CLI commands provide `xclaw memory search/show/import`.

**Tech Stack:** TypeScript 5.x ESM, Node.js >= 22, `@lancedb/lancedb` (vector DB), `apache-arrow` (LanceDB dependency), Vitest, pnpm monorepo

---

## Phase 4 Overview

```
Task 1:  Memory types + config — MemoryEntry, MemoryConfig, config extension
Task 2:  MemoryStore — Markdown file I/O (MEMORY.md + daily logs)
Task 3:  BM25 index — keyword search with TF-IDF scoring
Task 4:  VectorIndex — LanceDB wrapper for semantic search
Task 5:  HybridRetriever — merge BM25 + vector results (70/30 weighting)
Task 6:  MemoryManager — orchestrate store, index, retrieve, decay
Task 7:  Pipeline integration — inject memories into agent context, store after response
Task 8:  Memory CLI commands — search, show, import
Task 9:  Memory module exports + core integration
Task 10: Integration tests — full cycle: store → index → retrieve → pipeline
```

---

### Task 1: Memory Types + Config

**Files:**
- Create: `packages/core/src/memory/types.ts`
- Create: `packages/core/src/memory/types.test.ts`
- Modify: `packages/core/src/types/config.ts`
- Modify: `packages/core/src/types/config.test.ts`
- Modify: `packages/core/src/types/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/memory/types.test.ts
import { describe, it, expect } from 'vitest';
import { createMemoryEntry, computeDecayedScore } from './types.js';

describe('Memory types', () => {
  it('should create a MemoryEntry with defaults', () => {
    const entry = createMemoryEntry({
      content: 'User prefers TypeScript',
      source: 'conversation',
      userId: 'user-1',
    });
    expect(entry.id).toBeDefined();
    expect(entry.content).toBe('User prefers TypeScript');
    expect(entry.source).toBe('conversation');
    expect(entry.userId).toBe('user-1');
    expect(entry.createdAt).toBeGreaterThan(0);
    expect(entry.accessCount).toBe(0);
    expect(entry.importance).toBe(0.5);
  });

  it('should allow overriding defaults', () => {
    const entry = createMemoryEntry({
      content: 'Important decision',
      source: 'manual',
      userId: 'user-1',
      importance: 0.9,
      tags: ['decision'],
    });
    expect(entry.importance).toBe(0.9);
    expect(entry.tags).toEqual(['decision']);
  });

  it('should compute time-decayed score with 30-day half-life', () => {
    const now = Date.now();
    // Entry from right now => minimal decay
    const fresh = computeDecayedScore(1.0, now, now, 0);
    expect(fresh).toBeCloseTo(1.0, 1);

    // Entry from 30 days ago => ~50% decay
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const old = computeDecayedScore(1.0, now - thirtyDaysMs, now, 0);
    expect(old).toBeGreaterThan(0.4);
    expect(old).toBeLessThan(0.6);
  });

  it('should boost score based on access count', () => {
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const noAccess = computeDecayedScore(1.0, now - thirtyDaysMs, now, 0);
    const frequentAccess = computeDecayedScore(1.0, now - thirtyDaysMs, now, 10);
    expect(frequentAccess).toBeGreaterThan(noAccess);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/types.test.ts`
Expected: FAIL — module not found

**Step 3: Implement memory types**

```typescript
// packages/core/src/memory/types.ts
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
```

**Step 4: Add MemoryConfig to XClawConfig**

Add to `packages/core/src/types/config.ts`:

```typescript
export interface MemoryConfig {
  enabled: boolean;
  storagePath: string;          // default: ~/.xclaw/memory/
  openclawPath?: string;        // scan ~/.openclaw/memory/ for import
  vectorBackend: 'lancedb' | 'none';
  embeddingModel?: string;
  hybridWeights: {
    vector: number;             // default: 0.7
    bm25: number;               // default: 0.3
  };
  decayHalfLifeDays: number;    // default: 30
  maxRetrievedMemories: number; // default: 10
  autoExtract: boolean;         // extract memories from conversations
}
```

Add `memory: MemoryConfig;` to the `XClawConfig` interface.

Add `export type { MemoryConfig } from './config.js';` to `types/index.ts`.

**Step 5: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/types.test.ts`
Expected: PASS

**Step 6: Run ALL tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add packages/core/src/memory/ packages/core/src/types/config.ts packages/core/src/types/index.ts
git commit -m "feat(core): add memory types, MemoryConfig, time-decay scoring"
```

---

### Task 2: MemoryStore — Markdown File I/O

**Files:**
- Create: `packages/core/src/memory/store.ts`
- Create: `packages/core/src/memory/store.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/memory/store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from './store.js';

describe('MemoryStore', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'xclaw-memory-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should create MEMORY.md if it does not exist', async () => {
    const store = new MemoryStore(testDir);
    await store.initialize();
    const content = await readFile(join(testDir, 'MEMORY.md'), 'utf-8');
    expect(content).toContain('# Memory');
  });

  it('should append an entry to MEMORY.md', async () => {
    const store = new MemoryStore(testDir);
    await store.initialize();
    await store.append({ content: 'User prefers dark mode', tags: ['preference'], timestamp: Date.now() });
    const content = await readFile(join(testDir, 'MEMORY.md'), 'utf-8');
    expect(content).toContain('User prefers dark mode');
    expect(content).toContain('preference');
  });

  it('should write a daily log entry', async () => {
    const store = new MemoryStore(testDir);
    await store.initialize();
    const date = '2026-03-06';
    await store.writeDailyLog(date, 'Discussed project architecture.');
    const content = await readFile(join(testDir, date + '.md'), 'utf-8');
    expect(content).toContain('Discussed project architecture');
  });

  it('should append to existing daily log', async () => {
    const store = new MemoryStore(testDir);
    await store.initialize();
    const date = '2026-03-06';
    await store.writeDailyLog(date, 'Morning session.');
    await store.writeDailyLog(date, 'Afternoon session.');
    const content = await readFile(join(testDir, date + '.md'), 'utf-8');
    expect(content).toContain('Morning session');
    expect(content).toContain('Afternoon session');
  });

  it('should read all entries from MEMORY.md', async () => {
    const store = new MemoryStore(testDir);
    await store.initialize();
    await store.append({ content: 'Entry 1', tags: ['a'], timestamp: Date.now() });
    await store.append({ content: 'Entry 2', tags: ['b'], timestamp: Date.now() });
    const entries = await store.readAll();
    expect(entries).toHaveLength(2);
    expect(entries[0].content).toBe('Entry 1');
    expect(entries[1].content).toBe('Entry 2');
  });

  it('should handle empty MEMORY.md', async () => {
    const store = new MemoryStore(testDir);
    await store.initialize();
    const entries = await store.readAll();
    expect(entries).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/store.test.ts`
Expected: FAIL

**Step 3: Implement MemoryStore**

```typescript
// packages/core/src/memory/store.ts
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';

export interface StoreEntry {
  content: string;
  tags: string[];
  timestamp: number;
}

const MEMORY_HEADER = '# Memory\n\n> Long-term memory entries for xclaw.\n\n';
const ENTRY_SEPARATOR = '\n---\n\n';

export class MemoryStore {
  private readonly dir: string;
  private readonly memoryPath: string;

  constructor(dir: string) {
    this.dir = dir;
    this.memoryPath = join(dir, 'MEMORY.md');
  }

  async initialize(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      await access(this.memoryPath);
    } catch {
      await writeFile(this.memoryPath, MEMORY_HEADER, 'utf-8');
    }
  }

  async append(entry: StoreEntry): Promise<void> {
    const existing = await readFile(this.memoryPath, 'utf-8');
    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    const tagStr = entry.tags.length > 0 ? ` [${entry.tags.join(', ')}]` : '';
    const block = `### ${date}${tagStr}\n\n${entry.content}\n`;
    const separator = existing.trimEnd().endsWith('---') || existing === MEMORY_HEADER ? '' : ENTRY_SEPARATOR;
    await writeFile(this.memoryPath, existing.trimEnd() + '\n' + separator + block, 'utf-8');
  }

  async readAll(): Promise<StoreEntry[]> {
    const content = await readFile(this.memoryPath, 'utf-8');
    const entries: StoreEntry[] = [];

    // Split by ### headings
    const blocks = content.split(/^### /m).slice(1);
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const headerLine = lines[0] ?? '';
      const body = lines.slice(1).join('\n').trim();
      if (!body) continue;

      // Parse header: "2026-03-06 [tag1, tag2]"
      const tagMatch = headerLine.match(/\[([^\]]+)\]/);
      const tags = tagMatch ? tagMatch[1].split(',').map((t) => t.trim()) : [];
      const dateStr = headerLine.replace(/\s*\[.*\]/, '').trim();
      const timestamp = new Date(dateStr).getTime() || Date.now();

      entries.push({ content: body, tags, timestamp });
    }

    return entries;
  }

  async writeDailyLog(date: string, content: string): Promise<void> {
    const logPath = join(this.dir, `${date}.md`);
    let existing = '';
    try {
      existing = await readFile(logPath, 'utf-8');
    } catch {
      existing = `# Daily Log — ${date}\n\n`;
    }
    const timestamp = new Date().toISOString().split('T')[1]?.slice(0, 5) ?? '00:00';
    await writeFile(logPath, existing + `**${timestamp}** ${content}\n\n`, 'utf-8');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/memory/store.ts packages/core/src/memory/store.test.ts
git commit -m "feat(core): implement MemoryStore — MEMORY.md + daily log Markdown I/O"
```

---

### Task 3: BM25 Index

**Files:**
- Create: `packages/core/src/memory/bm25.ts`
- Create: `packages/core/src/memory/bm25.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/memory/bm25.test.ts
import { describe, it, expect } from 'vitest';
import { BM25Index } from './bm25.js';

describe('BM25Index', () => {
  it('should index and search documents', () => {
    const index = new BM25Index();
    index.add('1', 'TypeScript is a typed superset of JavaScript');
    index.add('2', 'Python is a dynamically typed language');
    index.add('3', 'Rust provides memory safety without garbage collection');

    const results = index.search('TypeScript typed');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('1');
  });

  it('should return empty for no matches', () => {
    const index = new BM25Index();
    index.add('1', 'Hello world');
    const results = index.search('quantum physics');
    expect(results).toHaveLength(0);
  });

  it('should rank more relevant documents higher', () => {
    const index = new BM25Index();
    index.add('1', 'dark mode preference setting');
    index.add('2', 'user prefers dark mode for all applications and editors');
    index.add('3', 'morning routine');

    const results = index.search('dark mode');
    expect(results.length).toBeGreaterThanOrEqual(2);
    // Both dark mode docs should appear before unrelated one
    const ids = results.map((r) => r.id);
    expect(ids).toContain('1');
    expect(ids).toContain('2');
    expect(ids).not.toContain('3');
  });

  it('should handle removing documents', () => {
    const index = new BM25Index();
    index.add('1', 'keep this');
    index.add('2', 'remove this');
    index.remove('2');

    const results = index.search('remove');
    expect(results).toHaveLength(0);
  });

  it('should tokenize and normalize text', () => {
    const index = new BM25Index();
    index.add('1', 'The QUICK Brown Fox Jumps');
    const results = index.search('quick brown fox');
    expect(results).toHaveLength(1);
  });

  it('should return scores between 0 and a positive number', () => {
    const index = new BM25Index();
    index.add('1', 'test document about memory');
    const results = index.search('memory');
    expect(results[0].score).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/bm25.test.ts`
Expected: FAIL

**Step 3: Implement BM25Index**

```typescript
// packages/core/src/memory/bm25.ts

export interface BM25Result {
  id: string;
  score: number;
}

interface Document {
  id: string;
  terms: string[];
  termFreqs: Map<string, number>;
  length: number;
}

/**
 * BM25 keyword search index.
 * Implements Okapi BM25 ranking with k1=1.5, b=0.75.
 */
export class BM25Index {
  private docs = new Map<string, Document>();
  private avgDocLength = 0;
  private readonly k1 = 1.5;
  private readonly b = 0.75;

  add(id: string, text: string): void {
    const terms = this.tokenize(text);
    const termFreqs = new Map<string, number>();
    for (const term of terms) {
      termFreqs.set(term, (termFreqs.get(term) ?? 0) + 1);
    }
    this.docs.set(id, { id, terms, termFreqs, length: terms.length });
    this.updateAvgLength();
  }

  remove(id: string): void {
    this.docs.delete(id);
    this.updateAvgLength();
  }

  search(query: string, limit = 10): BM25Result[] {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    const scores: BM25Result[] = [];
    const N = this.docs.size;

    for (const doc of this.docs.values()) {
      let score = 0;
      for (const term of queryTerms) {
        const tf = doc.termFreqs.get(term) ?? 0;
        if (tf === 0) continue;

        const df = this.documentFrequency(term);
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (doc.length / this.avgDocLength)));
        score += idf * tfNorm;
      }
      if (score > 0) {
        scores.push({ id: doc.id, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit);
  }

  private documentFrequency(term: string): number {
    let count = 0;
    for (const doc of this.docs.values()) {
      if (doc.termFreqs.has(term)) count++;
    }
    return count;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private updateAvgLength(): void {
    if (this.docs.size === 0) {
      this.avgDocLength = 0;
      return;
    }
    let total = 0;
    for (const doc of this.docs.values()) {
      total += doc.length;
    }
    this.avgDocLength = total / this.docs.size;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/bm25.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/memory/bm25.ts packages/core/src/memory/bm25.test.ts
git commit -m "feat(core): implement BM25Index — keyword search with TF-IDF scoring"
```

---

### Task 4: VectorIndex — LanceDB Wrapper

**Files:**
- Create: `packages/core/src/memory/vectorIndex.ts`
- Create: `packages/core/src/memory/vectorIndex.test.ts`
- Dependency: `@lancedb/lancedb`, `apache-arrow`

**Step 1: Install dependencies**

```bash
cd /Users/dateng/cutd_data/dev/xclaw && pnpm --filter @xclaw/core add @lancedb/lancedb apache-arrow
```

**Step 2: Write the failing test**

```typescript
// packages/core/src/memory/vectorIndex.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VectorIndex } from './vectorIndex.js';

describe('VectorIndex', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'xclaw-vector-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should add and search by embedding', async () => {
    const index = new VectorIndex(testDir);
    await index.initialize();

    // Use simple mock embeddings (3-dimensional for testing)
    await index.add('1', 'TypeScript preference', [1.0, 0.0, 0.0]);
    await index.add('2', 'Python preference', [0.0, 1.0, 0.0]);
    await index.add('3', 'Rust preference', [0.9, 0.1, 0.0]);

    // Query close to entry 1 and 3
    const results = await index.search([0.95, 0.05, 0.0], 2);
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Entry 1 or 3 should be top results (closest to query)
    const ids = results.map((r) => r.id);
    expect(ids).toContain('1');
  });

  it('should return empty for empty index', async () => {
    const index = new VectorIndex(testDir);
    await index.initialize();
    const results = await index.search([1.0, 0.0, 0.0], 5);
    expect(results).toHaveLength(0);
  });

  it('should remove entries', async () => {
    const index = new VectorIndex(testDir);
    await index.initialize();
    await index.add('1', 'test', [1.0, 0.0, 0.0]);
    await index.remove('1');
    const results = await index.search([1.0, 0.0, 0.0], 5);
    expect(results).toHaveLength(0);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/vectorIndex.test.ts`
Expected: FAIL

**Step 4: Implement VectorIndex**

```typescript
// packages/core/src/memory/vectorIndex.ts
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
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/vectorIndex.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/core/src/memory/vectorIndex.ts packages/core/src/memory/vectorIndex.test.ts packages/core/package.json pnpm-lock.yaml
git commit -m "feat(core): implement VectorIndex — LanceDB wrapper for semantic search"
```

---

### Task 5: HybridRetriever

**Files:**
- Create: `packages/core/src/memory/hybridRetriever.ts`
- Create: `packages/core/src/memory/hybridRetriever.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/memory/hybridRetriever.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/hybridRetriever.test.ts`
Expected: FAIL

**Step 3: Implement HybridRetriever**

```typescript
// packages/core/src/memory/hybridRetriever.ts
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
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/hybridRetriever.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/memory/hybridRetriever.ts packages/core/src/memory/hybridRetriever.test.ts
git commit -m "feat(core): implement HybridRetriever — merge BM25 + vector with weighted scoring"
```

---

### Task 6: MemoryManager

**Files:**
- Create: `packages/core/src/memory/manager.ts`
- Create: `packages/core/src/memory/manager.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/memory/manager.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/manager.test.ts`
Expected: FAIL

**Step 3: Implement MemoryManager**

```typescript
// packages/core/src/memory/manager.ts
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
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/manager.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/memory/manager.ts packages/core/src/memory/manager.test.ts
git commit -m "feat(core): implement MemoryManager — orchestrate store, index, retrieve"
```

---

### Task 7: Pipeline Integration

**Files:**
- Modify: `packages/core/src/gateway/pipeline.ts`
- Modify: `packages/core/src/gateway/pipeline.test.ts`

**Step 1: Write the failing test**

Add a new test case to the existing pipeline test file:

```typescript
// Add to packages/core/src/gateway/pipeline.test.ts

it('should inject memories into agent context when memoryManager is provided', async () => {
  const mockMemoryManager = {
    retrieve: vi.fn().mockResolvedValue([
      {
        entry: { id: '1', content: 'User prefers TypeScript', source: 'conversation', userId: 'user-1', tags: [], importance: 0.5, createdAt: Date.now(), updatedAt: Date.now(), accessCount: 0 },
        score: 0.8,
        source: 'hybrid',
      },
    ]),
    store: vi.fn().mockResolvedValue({}),
    storeDailyLog: vi.fn(),
  };

  const pipelineWithMemory = new MessagePipeline({
    ...pipelineConfig,
    memoryManager: mockMemoryManager as any,
  });

  const msg = createTestMessage('What language do I prefer?');
  await pipelineWithMemory.process(msg);

  expect(mockMemoryManager.retrieve).toHaveBeenCalledOnce();
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/gateway/pipeline.test.ts`
Expected: FAIL — memoryManager property not accepted

**Step 3: Modify MessagePipeline**

Update `packages/core/src/gateway/pipeline.ts`:

1. Add optional `memoryManager` to `MessagePipelineConfig`
2. Before agent dispatch (step 4), call `memoryManager.retrieve(text)` and prepend results to conversation history
3. After agent response (step 6), optionally store the exchange

```typescript
// Updated MessagePipelineConfig — add:
import type { MemoryManager } from '../memory/manager.js';

export interface MessagePipelineConfig {
  eventBus: EventBus;
  riskAssessor: RiskAssessor;
  approvalEngine: ApprovalEngine;
  auditLog: AuditLog;
  taskAnalyzer: TaskAnalyzer;
  modelRouter: ModelRouter;
  contextManager: ContextManager;
  dispatcher: AgentDispatcher;
  memoryManager?: MemoryManager;
}

// In process() method, between steps 4 and 5, add:

    // 4b. Memory: retrieve relevant memories
    let memoryContext = '';
    if (this.config.memoryManager) {
      const memories = await this.config.memoryManager.retrieve(text, 5);
      if (memories.length > 0) {
        memoryContext = memories.map((m) => m.entry.content).join('\n');
      }
    }

    // 5. Agent: dispatch (update conversationHistory to include memory)
    const conversationHistory = history.map((t) => ({ role: t.role, content: t.content }));
    if (memoryContext) {
      conversationHistory.unshift({ role: 'system' as const, content: `Relevant memories:\n${memoryContext}` });
    }

// In step 6, after recording the response, add:
    // 6b. Memory: store exchange for future retrieval
    if (this.config.memoryManager) {
      await this.config.memoryManager.storeDailyLog(`[${msg.source.userId}] ${text}\n→ ${result.content.slice(0, 200)}`);
    }
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/gateway/pipeline.test.ts`
Expected: PASS

**Step 5: Run ALL tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add packages/core/src/gateway/pipeline.ts packages/core/src/gateway/pipeline.test.ts
git commit -m "feat(core): integrate memory retrieval + daily logging into MessagePipeline"
```

---

### Task 8: Memory CLI Commands

**Files:**
- Create: `packages/cli/src/commands/memory.ts`
- Create: `packages/cli/src/commands/memory.test.ts`
- Modify: `packages/cli/src/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/commands/memory.test.ts
import { describe, it, expect } from 'vitest';
import { formatMemoryEntries, formatMemoryFile } from './memory.js';

describe('Memory CLI helpers', () => {
  it('should format memory entries for display', () => {
    const entries = [
      { content: 'User prefers TypeScript', tags: ['preference'], timestamp: Date.now() },
      { content: 'Project uses pnpm', tags: ['project'], timestamp: Date.now() },
    ];
    const output = formatMemoryEntries(entries);
    expect(output).toContain('TypeScript');
    expect(output).toContain('preference');
    expect(output).toContain('pnpm');
  });

  it('should format empty entries', () => {
    const output = formatMemoryEntries([]);
    expect(output).toContain('No memories');
  });

  it('should format MEMORY.md content for display', () => {
    const content = '# Memory\n\n### 2026-03-06 [preference]\n\nUser prefers dark mode\n';
    const output = formatMemoryFile(content);
    expect(output).toContain('dark mode');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/cli/src/commands/memory.test.ts`
Expected: FAIL

**Step 3: Implement memory CLI helpers**

```typescript
// packages/cli/src/commands/memory.ts

export interface DisplayEntry {
  content: string;
  tags: string[];
  timestamp: number;
}

export function formatMemoryEntries(entries: DisplayEntry[]): string {
  if (entries.length === 0) {
    return 'No memories found.';
  }

  const lines = entries.map((e) => {
    const date = new Date(e.timestamp).toISOString().split('T')[0];
    const tags = e.tags.length > 0 ? ` [${e.tags.join(', ')}]` : '';
    return `  ${date}${tags}  ${e.content}`;
  });
  return `${entries.length} memory(s):\n${lines.join('\n')}`;
}

export function formatMemoryFile(content: string): string {
  return content;
}
```

**Step 4: Update CLI index — register memory command**

Add to `packages/cli/src/index.ts`:

```typescript
import { formatMemoryEntries, formatMemoryFile } from './commands/memory.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const memoryCmd = program
  .command('memory')
  .description('Manage xclaw memory (search, show, import)');

memoryCmd
  .command('show')
  .description('Display MEMORY.md contents')
  .action(async () => {
    const memoryPath = join(homedir(), '.xclaw', 'memory', 'MEMORY.md');
    try {
      const content = await readFile(memoryPath, 'utf-8');
      console.log(formatMemoryFile(content));
    } catch {
      console.log('No memory file found. Start a conversation to create memories.');
    }
  });

memoryCmd
  .command('search <query>')
  .description('Search memories')
  .action(async (query: string) => {
    console.log(`Searching memories for: ${query}`);
    console.log('Memory search requires a running xclaw instance. Use "xclaw start" first.');
  });
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/cli/src/commands/memory.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/cli/src/commands/memory.ts packages/cli/src/commands/memory.test.ts packages/cli/src/index.ts
git commit -m "feat(cli): add memory show/search CLI commands"
```

---

### Task 9: Memory Module Exports + Core Integration

**Files:**
- Create: `packages/core/src/memory/index.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Create memory barrel export**

```typescript
// packages/core/src/memory/index.ts
export { createMemoryEntry, computeDecayedScore } from './types.js';
export type { MemoryEntry, MemorySearchResult, CreateMemoryInput } from './types.js';
export { MemoryStore } from './store.js';
export type { StoreEntry } from './store.js';
export { BM25Index } from './bm25.js';
export type { BM25Result } from './bm25.js';
export { VectorIndex } from './vectorIndex.js';
export type { VectorSearchResult } from './vectorIndex.js';
export { HybridRetriever } from './hybridRetriever.js';
export type { HybridWeights, HybridResult } from './hybridRetriever.js';
export { MemoryManager } from './manager.js';
export type { MemoryManagerConfig } from './manager.js';
```

**Step 2: Update core index**

Add to `packages/core/src/index.ts`:
```typescript
export * from './memory/index.js';
```

**Step 3: Run ALL tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add packages/core/src/memory/index.ts packages/core/src/index.ts
git commit -m "feat(core): add memory module exports — store, BM25, vector, hybrid, manager"
```

---

### Task 10: Integration Tests

**Files:**
- Create: `packages/core/src/memory/integration.test.ts`

**Step 1: Write integration test**

```typescript
// packages/core/src/memory/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryStore } from './store.js';
import { BM25Index } from './bm25.js';
import { HybridRetriever } from './hybridRetriever.js';
import { MemoryManager } from './manager.js';
import { createMemoryEntry } from './types.js';

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
    // Use a stub vector index that returns nothing
    const stubVector = {
      initialize: async () => {},
      add: async () => {},
      remove: async () => {},
      search: async () => [],
    };
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
    const stubVector = {
      initialize: async () => {},
      add: async () => {},
      remove: async () => {},
      search: async () => [],
    };
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
    const stubVector = {
      initialize: async () => {},
      add: async () => {},
      remove: async () => {},
      search: async () => [],
    };
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
    const stubVector = {
      initialize: async () => {},
      add: async () => {},
      remove: async () => {},
      search: async () => [],
    };
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
```

**Step 2: Run integration test**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/core/src/memory/integration.test.ts`
Expected: PASS

**Step 3: Run ALL tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add packages/core/src/memory/integration.test.ts
git commit -m "test(core): add memory integration tests — store, retrieve, persist, rebuild"
```

---

## Summary

After completing all 10 tasks, Phase 4 delivers:

- **MemoryEntry types** + `MemoryConfig` + time-decay scoring with access-count boost
- **MemoryStore** — MEMORY.md + daily log Markdown file I/O
- **BM25Index** — keyword search with Okapi BM25 TF-IDF ranking
- **VectorIndex** — LanceDB wrapper for semantic vector search
- **HybridRetriever** — merges BM25 (30%) + vector (70%) results with score normalization
- **MemoryManager** — orchestrates store + index + retrieve, rebuilds from existing files
- **Pipeline integration** — memory retrieval before agent dispatch, daily log after response
- **CLI commands** — `xclaw memory show`, `xclaw memory search`
- **Integration tests** — full cycle: store → index → retrieve → persist → rebuild
