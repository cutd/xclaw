import { CronJobStore } from '@xclaw/core';
import { join } from 'node:path';
import { homedir } from 'node:os';

function getStore(): CronJobStore {
  return new CronJobStore(join(homedir(), '.xclaw', 'cron-jobs.json'));
}

export async function cronList(): Promise<string> {
  const store = getStore();
  const jobs = await store.list();
  if (jobs.length === 0) return 'No cron jobs configured.';
  return jobs.map((j) => `  ${j.id}  ${j.enabled ? '\u2705' : '\u23F8\uFE0F'}  ${j.schedule}  ${j.skill}.${j.action}  (${j.source})`).join('\n');
}

export async function cronEnable(id: string): Promise<string> {
  const store = getStore();
  await store.setEnabled(id, true);
  return `Enabled job ${id}`;
}

export async function cronDisable(id: string): Promise<string> {
  const store = getStore();
  await store.setEnabled(id, false);
  return `Disabled job ${id}`;
}
