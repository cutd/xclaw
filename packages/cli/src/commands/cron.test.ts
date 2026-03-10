import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CronJobStore } from '@xclaw/core';

describe('cron command', () => {
  let tmpDir: string;
  let store: CronJobStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'xclaw-cron-cmd-'));
    store = new CronJobStore(join(tmpDir, 'cron-jobs.json'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should list empty jobs', async () => {
    const jobs = await store.list();
    expect(jobs).toHaveLength(0);
  });

  it('should add and list jobs', async () => {
    await store.add({ name: 'test', schedule: '0 9 * * *', skill: 'shell', action: 'shell_exec' });
    const jobs = await store.list();
    expect(jobs).toHaveLength(1);
  });
});
