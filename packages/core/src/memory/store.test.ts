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
