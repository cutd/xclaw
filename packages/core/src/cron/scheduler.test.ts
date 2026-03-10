import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CronScheduler } from './scheduler.js';
import type { CronJob } from './types.js';

describe('CronScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const makeJob = (overrides: Partial<CronJob> = {}): CronJob => ({
    id: 'cron-1',
    name: 'test-job',
    schedule: '* * * * *',
    skill: 'shell',
    action: 'shell_exec',
    enabled: true,
    source: 'config',
    ...overrides,
  });

  it('should start and stop without errors', () => {
    const executor = vi.fn().mockResolvedValue({ output: 'ok' });
    const scheduler = new CronScheduler({ executor });
    scheduler.loadJobs([makeJob()]);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it('should execute a due job on tick', async () => {
    const executor = vi.fn().mockResolvedValue({ output: 'ok' });
    const scheduler = new CronScheduler({ executor, intervalMs: 60_000 });
    scheduler.loadJobs([makeJob()]);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(61_000);

    expect(executor).toHaveBeenCalled();
    scheduler.stop();
  });

  it('should skip disabled jobs', async () => {
    const executor = vi.fn().mockResolvedValue({ output: 'ok' });
    const scheduler = new CronScheduler({ executor, intervalMs: 60_000 });
    scheduler.loadJobs([makeJob({ enabled: false })]);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(61_000);

    expect(executor).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('should handle executor errors gracefully', async () => {
    const executor = vi.fn().mockRejectedValue(new Error('skill failed'));
    const scheduler = new CronScheduler({ executor, intervalMs: 60_000 });
    scheduler.loadJobs([makeJob()]);
    scheduler.start();

    await vi.advanceTimersByTimeAsync(61_000);

    expect(executor).toHaveBeenCalled();
    scheduler.stop();
  });

  it('should report loaded job count', () => {
    const scheduler = new CronScheduler({ executor: vi.fn() });
    scheduler.loadJobs([makeJob(), makeJob({ id: 'cron-2', name: 'job-2' })]);
    expect(scheduler.getJobs()).toHaveLength(2);
  });
});
