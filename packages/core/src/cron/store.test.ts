import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CronJobStore } from './store.js';

describe('CronJobStore', () => {
  let store: CronJobStore;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'xclaw-cron-'));
    store = new CronJobStore(join(tmpDir, 'cron-jobs.json'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should add and list runtime jobs', async () => {
    await store.add({ name: 'test', schedule: '0 9 * * *', skill: 'shell', action: 'shell_exec' });
    const jobs = await store.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe('test');
    expect(jobs[0].source).toBe('runtime');
    expect(jobs[0].enabled).toBe(true);
  });

  it('should persist jobs to disk and reload', async () => {
    await store.add({ name: 'persist', schedule: '0 9 * * *', skill: 'notes', action: 'notes_list' });
    const store2 = new CronJobStore(join(tmpDir, 'cron-jobs.json'));
    const jobs = await store2.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe('persist');
  });

  it('should enable and disable jobs', async () => {
    await store.add({ name: 'toggle', schedule: '0 9 * * *', skill: 'shell', action: 'shell_exec' });
    const jobs = await store.list();
    await store.setEnabled(jobs[0].id, false);
    const updated = await store.list();
    expect(updated[0].enabled).toBe(false);
  });

  it('should remove a job', async () => {
    await store.add({ name: 'removeme', schedule: '0 9 * * *', skill: 'shell', action: 'shell_exec' });
    const jobs = await store.list();
    await store.remove(jobs[0].id);
    const after = await store.list();
    expect(after).toHaveLength(0);
  });
});
