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
