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
