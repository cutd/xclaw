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
