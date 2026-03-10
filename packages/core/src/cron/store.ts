import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CronJob } from './types.js';

export interface CronJobInput {
  name: string;
  schedule: string;
  skill: string;
  action: string;
  args?: Record<string, unknown>;
  channel?: string;
}

export class CronJobStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<CronJob[]> {
    if (!existsSync(this.filePath)) return [];
    const raw = await readFile(this.filePath, 'utf-8');
    return JSON.parse(raw) as CronJob[];
  }

  async add(input: CronJobInput): Promise<CronJob> {
    const jobs = await this.list();
    const job: CronJob = {
      id: `cron-${randomUUID().slice(0, 8)}`,
      name: input.name,
      schedule: input.schedule,
      skill: input.skill,
      action: input.action,
      args: input.args,
      channel: input.channel,
      enabled: true,
      source: 'runtime',
    };
    jobs.push(job);
    await this.save(jobs);
    return job;
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const jobs = await this.list();
    const job = jobs.find((j) => j.id === id);
    if (job) {
      job.enabled = enabled;
      await this.save(jobs);
    }
  }

  async remove(id: string): Promise<void> {
    const jobs = await this.list();
    const filtered = jobs.filter((j) => j.id !== id);
    await this.save(filtered);
  }

  private async save(jobs: CronJob[]): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.filePath, JSON.stringify(jobs, null, 2), 'utf-8');
  }
}
