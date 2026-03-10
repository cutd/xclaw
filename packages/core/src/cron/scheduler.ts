import { CronExpressionParser } from 'cron-parser';
import type { CronJob, CronExecutionResult } from './types.js';

export type CronExecutor = (job: CronJob) => Promise<{ output?: string; error?: string }>;

export interface CronSchedulerConfig {
  executor: CronExecutor;
  intervalMs?: number;
  onResult?: (result: CronExecutionResult) => void;
}

export class CronScheduler {
  private jobs: CronJob[] = [];
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly executor: CronExecutor;
  private readonly intervalMs: number;
  private readonly onResult?: (result: CronExecutionResult) => void;
  private lastCheck = 0;

  constructor(config: CronSchedulerConfig) {
    this.executor = config.executor;
    this.intervalMs = config.intervalMs ?? 30_000;
    this.onResult = config.onResult;
  }

  loadJobs(jobs: CronJob[]): void {
    this.jobs = [...jobs];
  }

  getJobs(): CronJob[] {
    return [...this.jobs];
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastCheck = Date.now();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  private async tick(): Promise<void> {
    const now = new Date();
    for (const job of this.jobs) {
      if (!job.enabled) continue;
      if (this.isDue(job, now)) {
        await this.executeJob(job);
      }
    }
    this.lastCheck = now.getTime();
  }

  private isDue(job: CronJob, now: Date): boolean {
    try {
      const interval = CronExpressionParser.parse(job.schedule, { currentDate: new Date(this.lastCheck) });
      const next = interval.next().toDate();
      return next.getTime() <= now.getTime();
    } catch {
      return false;
    }
  }

  private async executeJob(job: CronJob): Promise<void> {
    const executedAt = Date.now();
    try {
      const result = await this.executor(job);
      this.onResult?.({
        jobId: job.id,
        jobName: job.name,
        success: true,
        output: result.output,
        executedAt,
      });
    } catch (err) {
      this.onResult?.({
        jobId: job.id,
        jobName: job.name,
        success: false,
        error: (err as Error).message,
        executedAt,
      });
    }
  }
}
