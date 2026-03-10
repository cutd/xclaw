export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  skill: string;
  action: string;
  args?: Record<string, unknown>;
  channel?: string;
  enabled: boolean;
  source: 'config' | 'runtime';
}

export interface CronExecutionResult {
  jobId: string;
  jobName: string;
  success: boolean;
  output?: string;
  error?: string;
  executedAt: number;
}
