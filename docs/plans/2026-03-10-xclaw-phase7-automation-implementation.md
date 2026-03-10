# Phase 7: Automation, CLI & Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete Phase 7 gaps: cron scheduler, webhook engine, full CLI suite (init, stop, doctor, config, cron, send, status, sandbox), chat commands skill, and deployment files (install.sh, Dockerfile, docker-compose).

**Architecture:** Cron and webhook engines are new modules in `packages/core/src/`. CLI commands follow the existing Commander.js pattern in `packages/cli/src/commands/`. Chat commands are a skill in `skills/chat-commands/`. Config types are extended with `cron` and `webhooks` sections. The Runtime wires cron/webhook into its lifecycle.

**Tech Stack:** TypeScript 5.x, Vitest, Commander.js, `cron-parser` npm package, `node:http`, `node:crypto` (HMAC), `yaml` (config R/W)

---

## Plan Overview

```
Task 1:  Cron scheduler — core engine with config + runtime job sources
Task 2:  Webhook engine — HTTP handler with HMAC verification
Task 3:  Config & runtime integration — wire cron/webhook into types, config, runtime
Task 4:  CLI commands — init, stop, doctor, config, send, status, sandbox, cron
Task 5:  Chat commands skill — /status, /new, /reset, /compact, /think, /verbose
Task 6:  Deployment — install.sh, Dockerfile, docker-compose.yml
```

---

### Task 1: Cron Scheduler

**Files:**
- Create: `packages/core/src/cron/types.ts`
- Create: `packages/core/src/cron/scheduler.ts`
- Create: `packages/core/src/cron/scheduler.test.ts`
- Create: `packages/core/src/cron/store.ts`
- Create: `packages/core/src/cron/store.test.ts`
- Create: `packages/core/src/cron/index.ts`

**Step 1: Install cron-parser dependency**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm add cron-parser --filter @xclaw/core`

**Step 2: Write the types**

`packages/core/src/cron/types.ts`:
```typescript
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
```

`packages/core/src/cron/index.ts`:
```typescript
export { CronScheduler } from './scheduler.js';
export { CronJobStore } from './store.js';
export type { CronJob, CronExecutionResult } from './types.js';
```

**Step 3: Write the store test**

`packages/core/src/cron/store.test.ts`:
```typescript
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
```

**Step 4: Implement the store**

`packages/core/src/cron/store.ts`:
```typescript
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
```

**Step 5: Write the scheduler test**

`packages/core/src/cron/scheduler.test.ts`:
```typescript
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
    schedule: '* * * * *',   // every minute
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
    const scheduler = new CronScheduler({ executor, intervalMs: 1000 });
    scheduler.loadJobs([makeJob()]);
    scheduler.start();

    // Advance past the next minute boundary
    vi.advanceTimersByTime(61_000);
    await vi.runAllTimersAsync();

    expect(executor).toHaveBeenCalled();
    scheduler.stop();
  });

  it('should skip disabled jobs', async () => {
    const executor = vi.fn().mockResolvedValue({ output: 'ok' });
    const scheduler = new CronScheduler({ executor, intervalMs: 1000 });
    scheduler.loadJobs([makeJob({ enabled: false })]);
    scheduler.start();

    vi.advanceTimersByTime(61_000);
    await vi.runAllTimersAsync();

    expect(executor).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('should handle executor errors gracefully', async () => {
    const executor = vi.fn().mockRejectedValue(new Error('skill failed'));
    const scheduler = new CronScheduler({ executor, intervalMs: 1000 });
    scheduler.loadJobs([makeJob()]);
    scheduler.start();

    vi.advanceTimersByTime(61_000);
    await vi.runAllTimersAsync();

    // Should not throw — errors are caught
    expect(executor).toHaveBeenCalled();
    scheduler.stop();
  });

  it('should report loaded job count', () => {
    const scheduler = new CronScheduler({ executor: vi.fn() });
    scheduler.loadJobs([makeJob(), makeJob({ id: 'cron-2', name: 'job-2' })]);
    expect(scheduler.getJobs()).toHaveLength(2);
  });
});
```

**Step 6: Implement the scheduler**

`packages/core/src/cron/scheduler.ts`:
```typescript
import { parseExpression } from 'cron-parser';
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
      const interval = parseExpression(job.schedule, { currentDate: new Date(this.lastCheck) });
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
```

**Step 7: Run tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run packages/core/src/cron/`
Expected: ALL PASS

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add packages/core/src/cron/ pnpm-lock.yaml
git commit -m "feat(core): add cron scheduler with job store and execution engine"
```

---

### Task 2: Webhook Engine

**Files:**
- Create: `packages/core/src/webhook/types.ts`
- Create: `packages/core/src/webhook/router.ts`
- Create: `packages/core/src/webhook/router.test.ts`
- Create: `packages/core/src/webhook/index.ts`

**Step 1: Write the types**

`packages/core/src/webhook/types.ts`:
```typescript
export interface WebhookConfig {
  id: string;
  name: string;
  path: string;
  skill: string;
  action: string;
  args?: Record<string, unknown>;
  secret?: string;
  enabled: boolean;
}
```

`packages/core/src/webhook/index.ts`:
```typescript
export { WebhookRouter } from './router.js';
export type { WebhookConfig } from './types.js';
```

**Step 2: Write the test**

`packages/core/src/webhook/router.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { WebhookRouter } from './router.js';
import type { WebhookConfig } from './types.js';

function makeWebhook(overrides: Partial<WebhookConfig> = {}): WebhookConfig {
  return {
    id: 'wh-1',
    name: 'test',
    path: '/webhook/test',
    skill: 'shell',
    action: 'shell_exec',
    enabled: true,
    ...overrides,
  };
}

describe('WebhookRouter', () => {
  let server: Server;
  let port: number;
  const executor = vi.fn().mockResolvedValue({ output: 'ok' });

  beforeEach(async () => {
    vi.clearAllMocks();
    const router = new WebhookRouter({ executor });
    router.loadWebhooks([makeWebhook()]);
    server = createServer(router.handler());
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should handle POST to a registered webhook', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/webhook/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'value' }),
    });
    expect(res.status).toBe(200);
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({ skill: 'shell', action: 'shell_exec' }),
      expect.objectContaining({ key: 'value' }),
    );
  });

  it('should return 404 for unknown webhook path', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/webhook/unknown`, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('should return 405 for non-POST methods', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/webhook/test`, { method: 'GET' });
    expect(res.status).toBe(405);
  });

  it('should verify HMAC signature when secret is configured', async () => {
    const secret = 'test-secret';
    const router2 = new WebhookRouter({ executor: vi.fn() });
    router2.loadWebhooks([makeWebhook({ secret })]);
    const server2 = createServer(router2.handler());
    await new Promise<void>((resolve) => server2.listen(0, '127.0.0.1', () => resolve()));
    const port2 = (server2.address() as any).port;

    // Request without signature
    const res = await fetch(`http://127.0.0.1:${port2}/webhook/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(401);

    await new Promise<void>((resolve) => server2.close(() => resolve()));
  });

  it('should accept valid HMAC signature', async () => {
    const secret = 'test-secret';
    const validExecutor = vi.fn().mockResolvedValue({ output: 'ok' });
    const router3 = new WebhookRouter({ executor: validExecutor });
    router3.loadWebhooks([makeWebhook({ secret })]);
    const server3 = createServer(router3.handler());
    await new Promise<void>((resolve) => server3.listen(0, '127.0.0.1', () => resolve()));
    const port3 = (server3.address() as any).port;

    const body = JSON.stringify({ event: 'push' });
    const { createHmac } = await import('node:crypto');
    const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

    const res = await fetch(`http://127.0.0.1:${port3}/webhook/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': sig },
      body,
    });
    expect(res.status).toBe(200);
    expect(validExecutor).toHaveBeenCalled();

    await new Promise<void>((resolve) => server3.close(() => resolve()));
  });

  it('should skip disabled webhooks', async () => {
    const router4 = new WebhookRouter({ executor: vi.fn() });
    router4.loadWebhooks([makeWebhook({ enabled: false })]);
    const server4 = createServer(router4.handler());
    await new Promise<void>((resolve) => server4.listen(0, '127.0.0.1', () => resolve()));
    const port4 = (server4.address() as any).port;

    const res = await fetch(`http://127.0.0.1:${port4}/webhook/test`, { method: 'POST' });
    expect(res.status).toBe(404);

    await new Promise<void>((resolve) => server4.close(() => resolve()));
  });
});
```

**Step 3: Implement the webhook router**

`packages/core/src/webhook/router.ts`:
```typescript
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse, RequestListener } from 'node:http';
import type { WebhookConfig } from './types.js';

export type WebhookExecutor = (
  webhook: WebhookConfig,
  body: Record<string, unknown>,
) => Promise<{ output?: string; error?: string }>;

export interface WebhookRouterConfig {
  executor: WebhookExecutor;
}

export class WebhookRouter {
  private webhooks: WebhookConfig[] = [];
  private readonly executor: WebhookExecutor;

  constructor(config: WebhookRouterConfig) {
    this.executor = config.executor;
  }

  loadWebhooks(webhooks: WebhookConfig[]): void {
    this.webhooks = [...webhooks];
  }

  handler(): RequestListener {
    return (req: IncomingMessage, res: ServerResponse) => {
      this.handle(req, res).catch(() => {
        res.writeHead(500);
        res.end('Internal Server Error');
      });
    };
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method Not Allowed');
      return;
    }

    const webhook = this.webhooks.find((w) => w.enabled && w.path === req.url);
    if (!webhook) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const body = await this.readBody(req);

    if (webhook.secret) {
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      if (!signature || !this.verifyHmac(webhook.secret, body, signature)) {
        res.writeHead(401);
        res.end('Unauthorized');
        return;
      }
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      // Non-JSON body — use empty object
    }

    // Fire-and-forget execution
    this.executor(webhook, { ...webhook.args, ...parsed }).catch(() => {});

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }

  private verifyHmac(secret: string, body: string, signature: string): boolean {
    const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}
```

**Step 4: Run tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run packages/core/src/webhook/`
Expected: ALL PASS

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add packages/core/src/webhook/
git commit -m "feat(core): add webhook router with HMAC verification"
```

---

### Task 3: Config & Runtime Integration

**Files:**
- Modify: `packages/core/src/types/config.ts`
- Modify: `packages/core/src/runtime/configLoader.ts`
- Modify: `packages/core/src/runtime/runtime.ts`
- Modify: `packages/core/src/types/index.ts`

**Step 1: Extend config types**

Add to `packages/core/src/types/config.ts` (after `MemoryConfig` and before `XClawConfig`):

```typescript
export interface CronConfig {
  [name: string]: {
    schedule: string;
    skill: string;
    action: string;
    args?: Record<string, unknown>;
    channel?: string;
  };
}

export interface WebhookConfigEntry {
  path: string;
  skill: string;
  action: string;
  args?: Record<string, unknown>;
  secret?: string;
}

export interface WebhooksConfig {
  [name: string]: WebhookConfigEntry;
}
```

Add `cron` and `webhooks` to `XClawConfig`:
```typescript
export interface XClawConfig {
  // ... existing fields ...
  cron?: CronConfig;
  webhooks?: WebhooksConfig;
}
```

**Step 2: Update DEFAULT_CONFIG in configLoader.ts**

No changes needed — `cron` and `webhooks` are optional (`?`), so they default to `undefined`.

**Step 3: Update runtime to wire cron and webhooks**

Modify `packages/core/src/runtime/runtime.ts`:

Add imports:
```typescript
import { CronScheduler } from '../cron/scheduler.js';
import { CronJobStore } from '../cron/store.js';
import { WebhookRouter } from '../webhook/router.js';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CronJob } from '../cron/types.js';
```

Add fields to `XClawRuntime`:
```typescript
private cronScheduler?: CronScheduler;
private cronStore?: CronJobStore;
private webhookRouter?: WebhookRouter;
private httpServer?: Server;
```

In `start()`, after step 7 (channel loading), add step 8 (cron) and step 9 (webhooks):

```typescript
// 8. Cron scheduler
const cronJobs: CronJob[] = [];
if (this.config.cron) {
  for (const [name, jobConfig] of Object.entries(this.config.cron)) {
    cronJobs.push({
      id: `config-${name}`,
      name,
      schedule: jobConfig.schedule,
      skill: jobConfig.skill,
      action: jobConfig.action,
      args: jobConfig.args,
      channel: jobConfig.channel,
      enabled: true,
      source: 'config',
    });
  }
}

this.cronStore = new CronJobStore(join(homedir(), '.xclaw', 'cron-jobs.json'));
const runtimeJobs = await this.cronStore.list();
const allJobs = [...cronJobs, ...runtimeJobs];

this.cronScheduler = new CronScheduler({
  executor: async (job) => {
    // TODO: dispatch to skill via plugin registry
    return { output: `Executed ${job.skill}.${job.action}` };
  },
});
this.cronScheduler.loadJobs(allJobs);
this.cronScheduler.start();

// 9. Webhook HTTP server
if (this.config.webhooks && Object.keys(this.config.webhooks).length > 0) {
  this.webhookRouter = new WebhookRouter({
    executor: async (webhook, body) => {
      return { output: `Webhook ${webhook.name} triggered` };
    },
  });

  const webhookConfigs = Object.entries(this.config.webhooks).map(([name, wh]) => ({
    id: `wh-${name}`,
    name,
    path: wh.path,
    skill: wh.skill,
    action: wh.action,
    args: wh.args,
    secret: wh.secret,
    enabled: true,
  }));
  this.webhookRouter.loadWebhooks(webhookConfigs);

  this.httpServer = createServer(this.webhookRouter.handler());
  const webhookPort = this.config.gateway.port + 1;
  this.httpServer.listen(webhookPort, this.config.gateway.host);
}
```

In `stop()`, add cleanup before existing code:
```typescript
if (this.cronScheduler) {
  this.cronScheduler.stop();
  this.cronScheduler = undefined;
}
if (this.httpServer) {
  await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()));
  this.httpServer = undefined;
}
```

Add accessors:
```typescript
getCronScheduler(): CronScheduler | undefined {
  return this.cronScheduler;
}

getCronStore(): CronJobStore | undefined {
  return this.cronStore;
}
```

**Step 4: Update core exports**

Add to `packages/core/src/types/index.ts`:
```typescript
export type { CronConfig, WebhookConfigEntry, WebhooksConfig } from './config.js';
```

Add new barrel exports in the main `packages/core/src/index.ts` (or wherever core re-exports):
```typescript
export { CronScheduler, CronJobStore } from './cron/index.js';
export type { CronJob, CronExecutionResult } from './cron/index.js';
export { WebhookRouter } from './webhook/index.js';
export type { WebhookConfig } from './webhook/index.js';
```

**Step 5: Run tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add packages/core/src/types/ packages/core/src/runtime/ packages/core/src/cron/index.ts packages/core/src/webhook/index.ts
git commit -m "feat(core): wire cron scheduler and webhook router into runtime"
```

---

### Task 4: CLI Commands

**Files:**
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/init.test.ts`
- Create: `packages/cli/src/commands/stop.ts`
- Create: `packages/cli/src/commands/stop.test.ts`
- Create: `packages/cli/src/commands/doctor.ts`
- Create: `packages/cli/src/commands/doctor.test.ts`
- Create: `packages/cli/src/commands/config.ts`
- Create: `packages/cli/src/commands/config.test.ts`
- Create: `packages/cli/src/commands/cron.ts`
- Create: `packages/cli/src/commands/cron.test.ts`
- Create: `packages/cli/src/commands/send.ts`
- Create: `packages/cli/src/commands/send.test.ts`
- Create: `packages/cli/src/commands/status.ts`
- Create: `packages/cli/src/commands/status.test.ts`
- Create: `packages/cli/src/commands/sandboxCmd.ts`
- Create: `packages/cli/src/commands/sandboxCmd.test.ts`
- Modify: `packages/cli/src/index.ts`

**Step 1: Write init command**

`packages/cli/src/commands/init.ts`:
```typescript
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { stringify as yamlStringify } from 'yaml';

export interface InitAnswers {
  provider: string;
  apiKey: string;
  model: string;
}

export function buildConfigYaml(answers: InitAnswers): string {
  const config = {
    version: '0.1.0',
    providers: [
      {
        name: answers.provider,
        type: answers.provider,
        apiKeyRef: `XCLAW_${answers.provider.toUpperCase()}_KEY`,
        default: true,
      },
    ],
    router: {
      defaultProvider: answers.provider,
      defaultModel: answers.model,
    },
    channels: [],
    gateway: { host: '127.0.0.1', port: 18789 },
  };
  return yamlStringify(config);
}

export async function initCommand(answers: InitAnswers): Promise<string> {
  const xclawDir = join(homedir(), '.xclaw');
  if (!existsSync(xclawDir)) await mkdir(xclawDir, { recursive: true });

  const configPath = join(xclawDir, 'xclaw.config.yaml');
  if (existsSync(configPath)) {
    return `Config already exists at ${configPath}. Delete it first to re-initialize.`;
  }

  const yaml = buildConfigYaml(answers);
  await writeFile(configPath, yaml, 'utf-8');
  return `Config written to ${configPath}`;
}
```

`packages/cli/src/commands/init.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildConfigYaml } from './init.js';

describe('init command', () => {
  it('should generate valid YAML config', () => {
    const yaml = buildConfigYaml({ provider: 'anthropic', apiKey: 'sk-test', model: 'claude-sonnet-4-5' });
    expect(yaml).toContain('anthropic');
    expect(yaml).toContain('claude-sonnet-4-5');
    expect(yaml).toContain('version:');
  });
});
```

**Step 2: Write stop command**

`packages/cli/src/commands/stop.ts`:
```typescript
import WebSocket from 'ws';

export async function stopCommand(host = '127.0.0.1', port = 18789): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${host}:${port}`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'gateway.stop', id: 'stop-1', payload: {}, timestamp: Date.now() }));
      ws.close();
      resolve('Shutdown signal sent.');
    });
    ws.on('error', () => {
      resolve('Could not connect to gateway. Is it running?');
    });
  });
}
```

`packages/cli/src/commands/stop.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { stopCommand } from './stop.js';

describe('stop command', () => {
  it('should return error message when gateway is not running', async () => {
    const result = await stopCommand('127.0.0.1', 19999);
    expect(result).toContain('Could not connect');
  });
});
```

**Step 3: Write doctor command**

`packages/cli/src/commands/doctor.ts`:
```typescript
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export async function runDoctorChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Check config file
  const configPath = join(homedir(), '.xclaw', 'xclaw.config.yaml');
  results.push({
    name: 'Config file',
    status: existsSync(configPath) ? 'pass' : 'fail',
    message: existsSync(configPath) ? configPath : 'Not found. Run "xclaw init".',
  });

  // Check API key
  const hasKey = !!(process.env.XCLAW_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY);
  results.push({
    name: 'API key',
    status: hasKey ? 'pass' : 'warn',
    message: hasKey ? 'Found in environment' : 'No XCLAW_ANTHROPIC_KEY or ANTHROPIC_API_KEY set.',
  });

  // Check memory directory
  const memDir = join(homedir(), '.xclaw', 'memory');
  results.push({
    name: 'Memory storage',
    status: existsSync(memDir) ? 'pass' : 'warn',
    message: existsSync(memDir) ? memDir : 'Not found. Will be created on first use.',
  });

  // Check Node.js version
  const nodeVersion = parseInt(process.version.slice(1), 10);
  results.push({
    name: 'Node.js version',
    status: nodeVersion >= 22 ? 'pass' : 'fail',
    message: `${process.version} (requires >= 22)`,
  });

  return results;
}

export function formatDoctorResults(results: CheckResult[]): string {
  const icons = { pass: '✅', fail: '❌', warn: '⚠️' };
  return results.map((r) => `${icons[r.status]} ${r.name}: ${r.message}`).join('\n');
}
```

`packages/cli/src/commands/doctor.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { runDoctorChecks, formatDoctorResults } from './doctor.js';

describe('doctor command', () => {
  it('should return an array of check results', async () => {
    const results = await runDoctorChecks();
    expect(results.length).toBeGreaterThanOrEqual(3);
    for (const r of results) {
      expect(['pass', 'fail', 'warn']).toContain(r.status);
    }
  });

  it('should format results with icons', () => {
    const formatted = formatDoctorResults([
      { name: 'Test', status: 'pass', message: 'OK' },
      { name: 'Test2', status: 'fail', message: 'Bad' },
    ]);
    expect(formatted).toContain('✅');
    expect(formatted).toContain('❌');
  });
});
```

**Step 4: Write config command**

`packages/cli/src/commands/config.ts`:
```typescript
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml, stringify as yamlStringify } from 'yaml';

export function resolveConfigPath(): string {
  return process.env.XCLAW_CONFIG ?? join(homedir(), '.xclaw', 'xclaw.config.yaml');
}

export async function configGet(key: string): Promise<string> {
  const path = resolveConfigPath();
  try {
    const raw = await readFile(path, 'utf-8');
    const config = parseYaml(raw) as Record<string, unknown>;
    const value = getNestedValue(config, key);
    if (value === undefined) return `Key "${key}" not found.`;
    return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  } catch {
    return 'Config file not found. Run "xclaw init".';
  }
}

export async function configSet(key: string, value: string): Promise<string> {
  const path = resolveConfigPath();
  let config: Record<string, unknown>;
  try {
    const raw = await readFile(path, 'utf-8');
    config = parseYaml(raw) as Record<string, unknown>;
  } catch {
    return 'Config file not found. Run "xclaw init".';
  }

  setNestedValue(config, key, value);
  await writeFile(path, yamlStringify(config), 'utf-8');
  return `Set ${key} = ${value}`;
}

export async function configList(): Promise<string> {
  const path = resolveConfigPath();
  try {
    const raw = await readFile(path, 'utf-8');
    return raw;
  } catch {
    return 'Config file not found. Run "xclaw init".';
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: string): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current) || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  // Try to parse as number/boolean
  if (value === 'true') current[keys[keys.length - 1]] = true;
  else if (value === 'false') current[keys[keys.length - 1]] = false;
  else if (!isNaN(Number(value))) current[keys[keys.length - 1]] = Number(value);
  else current[keys[keys.length - 1]] = value;
}
```

`packages/cli/src/commands/config.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configGet, configSet, configList } from './config.js';

describe('config command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'xclaw-config-cmd-'));
    const configPath = join(tmpDir, 'config.yaml');
    await writeFile(configPath, 'version: "0.1.0"\ngateway:\n  port: 18789\n', 'utf-8');
    vi.stubEnv('XCLAW_CONFIG', configPath);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should get a nested value', async () => {
    const result = await configGet('gateway.port');
    expect(result).toBe('18789');
  });

  it('should set a value', async () => {
    await configSet('gateway.port', '9999');
    const result = await configGet('gateway.port');
    expect(result).toBe('9999');
  });

  it('should list full config', async () => {
    const result = await configList();
    expect(result).toContain('version');
    expect(result).toContain('gateway');
  });

  it('should handle missing key', async () => {
    const result = await configGet('nonexistent.key');
    expect(result).toContain('not found');
  });
});
```

**Step 5: Write remaining commands (cron, send, status, sandbox)**

`packages/cli/src/commands/cron.ts`:
```typescript
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
  return jobs.map((j) => `  ${j.id}  ${j.enabled ? '✅' : '⏸️'}  ${j.schedule}  ${j.skill}.${j.action}  (${j.source})`).join('\n');
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
```

`packages/cli/src/commands/cron.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
```

`packages/cli/src/commands/send.ts`:
```typescript
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

export async function sendCommand(message: string, host = '127.0.0.1', port = 18789): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${host}:${port}`);
    const timeout = setTimeout(() => {
      ws.close();
      resolve('Timeout: no response from gateway.');
    }, 30000);

    ws.on('open', () => {
      // Create session first
      ws.send(JSON.stringify({ type: 'session.create', id: randomUUID(), payload: { userId: 'cli-send' }, timestamp: Date.now() }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'session.create') {
        // Send the actual message
        ws.send(JSON.stringify({
          type: 'chat.message',
          id: randomUUID(),
          sessionId: msg.payload.sessionId,
          payload: { text: message },
          timestamp: Date.now(),
        }));
      } else if (msg.type === 'chat.response' || msg.payload?.text) {
        clearTimeout(timeout);
        ws.close();
        resolve(msg.payload?.text ?? msg.payload?.content ?? JSON.stringify(msg.payload));
      }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve('Could not connect to gateway. Is it running?');
    });
  });
}
```

`packages/cli/src/commands/send.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { sendCommand } from './send.js';

describe('send command', () => {
  it('should return error when gateway is not running', async () => {
    const result = await sendCommand('hello', '127.0.0.1', 19999);
    expect(result).toContain('Could not connect');
  });
});
```

`packages/cli/src/commands/status.ts`:
```typescript
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

export async function statusCommand(host = '127.0.0.1', port = 18789): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${host}:${port}`);
    const timeout = setTimeout(() => {
      ws.close();
      resolve('Timeout: no response from gateway.');
    }, 5000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'status.query', id: randomUUID(), payload: {}, timestamp: Date.now() }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'status.response') {
        clearTimeout(timeout);
        ws.close();
        const p = msg.payload;
        const uptimeSec = Math.floor((p.uptime ?? 0) / 1000);
        const lines = [
          `xclaw status:`,
          `  Uptime: ${uptimeSec}s`,
          `  Sessions: ${p.sessions ?? 0}`,
          `  Channels: ${(p.channels ?? []).join(', ') || 'none'}`,
        ];
        resolve(lines.join('\n'));
      }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve('Could not connect to gateway. Is it running?');
    });
  });
}
```

`packages/cli/src/commands/status.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { statusCommand } from './status.js';

describe('status command', () => {
  it('should return error when gateway is not running', async () => {
    const result = await statusCommand('127.0.0.1', 19999);
    expect(result).toContain('Could not connect');
  });
});
```

`packages/cli/src/commands/sandboxCmd.ts`:
```typescript
export function sandboxInfo(): string {
  const platform = process.platform;
  const backends: Record<string, string> = {
    darwin: 'macOS sandbox-exec (App Sandbox)',
    linux: 'bubblewrap (bwrap)',
  };
  const backend = backends[platform] ?? 'VM isolate (fallback)';

  return [
    'Sandbox info:',
    `  Platform: ${platform}`,
    `  Backend: ${backend}`,
    `  Default mode: passthrough`,
    `  Memory limit: 512 MB`,
    `  Timeout: 30s`,
  ].join('\n');
}
```

`packages/cli/src/commands/sandboxCmd.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { sandboxInfo } from './sandboxCmd.js';

describe('sandbox command', () => {
  it('should return sandbox information', () => {
    const info = sandboxInfo();
    expect(info).toContain('Platform');
    expect(info).toContain('Backend');
    expect(info).toContain('Default mode');
  });
});
```

**Step 6: Update CLI entry point**

Modify `packages/cli/src/index.ts` to register all new commands. Add the imports and command registrations following the existing pattern. See the existing file at `packages/cli/src/index.ts` for the Commander.js structure.

New commands to add:

```typescript
import { initCommand } from './commands/init.js';
import { stopCommand } from './commands/stop.js';
import { runDoctorChecks, formatDoctorResults } from './commands/doctor.js';
import { configGet, configSet, configList } from './commands/config.js';
import { cronList, cronEnable, cronDisable } from './commands/cron.js';
import { sendCommand } from './commands/send.js';
import { statusCommand } from './commands/status.js';
import { sandboxInfo } from './commands/sandboxCmd.js';
```

Register each as a subcommand following the existing pattern.

**Step 7: Run tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run packages/cli/`
Expected: ALL PASS

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): add init, stop, doctor, config, cron, send, status, sandbox commands"
```

---

### Task 5: Chat Commands Skill

**Files:**
- Create: `skills/chat-commands/package.json`
- Create: `skills/chat-commands/tsconfig.json`
- Create: `skills/chat-commands/src/index.ts`
- Create: `skills/chat-commands/src/chatCommandsSkill.ts`
- Create: `skills/chat-commands/src/chatCommandsSkill.test.ts`

**Step 1: Create package scaffolding**

`skills/chat-commands/package.json`:
```json
{
  "name": "@xclaw/skill-chat-commands",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "import": "./src/index.ts" }
  },
  "scripts": { "test": "vitest run" },
  "dependencies": {
    "@xclaw/core": "workspace:*",
    "@xclaw/sdk": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`skills/chat-commands/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

`skills/chat-commands/src/index.ts`:
```typescript
export { ChatCommandsSkill } from './chatCommandsSkill.js';
```

**Step 2: Write the test**

`skills/chat-commands/src/chatCommandsSkill.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { ChatCommandsSkill } from './chatCommandsSkill.js';

describe('ChatCommandsSkill', () => {
  const skill = new ChatCommandsSkill();

  describe('manifest', () => {
    it('should have correct type and name', () => {
      expect(skill.manifest.type).toBe('skill');
      expect(skill.manifest.name).toBe('chat-commands');
    });
  });

  describe('tools', () => {
    it('should expose 6 tools', () => {
      expect(skill.tools).toHaveLength(6);
      const names = skill.tools.map((t) => t.name);
      expect(names).toContain('chat_status');
      expect(names).toContain('chat_new');
      expect(names).toContain('chat_reset');
      expect(names).toContain('chat_compact');
      expect(names).toContain('chat_think');
      expect(names).toContain('chat_verbose');
    });
  });

  describe('chat_status', () => {
    it('should return session status', async () => {
      const result = await skill.execute('chat_status', { sessionId: 'sess-1' }) as any;
      expect(result).toHaveProperty('sessionId');
    });
  });

  describe('chat_new', () => {
    it('should return new session instruction', async () => {
      const result = await skill.execute('chat_new', {}) as any;
      expect(result).toHaveProperty('action', 'new_session');
    });
  });

  describe('chat_reset', () => {
    it('should return reset instruction', async () => {
      const result = await skill.execute('chat_reset', { sessionId: 'sess-1' }) as any;
      expect(result).toHaveProperty('action', 'reset');
    });
  });

  describe('chat_compact', () => {
    it('should return compact instruction', async () => {
      const result = await skill.execute('chat_compact', { sessionId: 'sess-1' }) as any;
      expect(result).toHaveProperty('action', 'compact');
    });
  });

  describe('chat_think', () => {
    it('should set reasoning level', async () => {
      const result = await skill.execute('chat_think', { level: 'thorough' }) as any;
      expect(result).toHaveProperty('level', 'thorough');
    });
  });

  describe('chat_verbose', () => {
    it('should toggle verbose mode', async () => {
      const result = await skill.execute('chat_verbose', { enabled: true }) as any;
      expect(result).toHaveProperty('verbose', true);
    });
  });

  describe('error handling', () => {
    it('should return error for unknown tool', async () => {
      const result = await skill.execute('unknown', {}) as any;
      expect(result).toHaveProperty('error');
    });
  });
});
```

**Step 3: Implement ChatCommandsSkill**

`skills/chat-commands/src/chatCommandsSkill.ts`:
```typescript
import type { SkillPlugin, PluginManifest, ToolDefinition } from '@xclaw/core';

export class ChatCommandsSkill implements SkillPlugin {
  manifest: PluginManifest = {
    name: 'chat-commands',
    version: '0.1.0',
    description: 'In-chat slash commands for session management',
    type: 'skill',
    permissions: {},
  };

  tools: ToolDefinition[] = [
    { name: 'chat_status', description: 'Show current session status', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } } } },
    { name: 'chat_new', description: 'Create a new session', inputSchema: { type: 'object', properties: {} } },
    { name: 'chat_reset', description: 'Reset current session context', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } } } },
    { name: 'chat_compact', description: 'Compress current context', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } } } },
    { name: 'chat_think', description: 'Set reasoning level', inputSchema: { type: 'object', properties: { level: { type: 'string', enum: ['fast', 'balanced', 'thorough'] } }, required: ['level'] } },
    { name: 'chat_verbose', description: 'Toggle verbose output', inputSchema: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] } },
  ];

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'chat_status':
        return { sessionId: args.sessionId ?? 'unknown', action: 'status', message: 'Session active' };
      case 'chat_new':
        return { action: 'new_session', message: 'New session created' };
      case 'chat_reset':
        return { action: 'reset', sessionId: args.sessionId, message: 'Session context reset' };
      case 'chat_compact':
        return { action: 'compact', sessionId: args.sessionId, message: 'Context compacted' };
      case 'chat_think':
        return { action: 'think', level: args.level, message: `Reasoning level set to ${args.level}` };
      case 'chat_verbose':
        return { action: 'verbose', verbose: args.enabled, message: `Verbose mode ${args.enabled ? 'on' : 'off'}` };
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }
}
```

**Step 4: Install deps and run tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm install`
Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run skills/chat-commands/`
Expected: ALL PASS

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add skills/chat-commands/ pnpm-lock.yaml
git commit -m "feat(skills): add Chat Commands skill — /status, /new, /reset, /compact, /think, /verbose"
```

---

### Task 6: Deployment Files

**Files:**
- Create: `install.sh`
- Create: `Dockerfile`
- Create: `docker-compose.yml`

**Step 1: Create install.sh**

`install.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

echo "🦞 xclaw installer"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "❌ Node.js is required but not installed."
  echo "   Install Node.js 22+ from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_VERSION" -lt 22 ]; then
  echo "❌ Node.js 22+ required, found $(node -v)"
  exit 1
fi

# Check pnpm
if ! command -v pnpm &>/dev/null; then
  echo "📦 Installing pnpm..."
  npm install -g pnpm
fi

INSTALL_DIR="${XCLAW_INSTALL_DIR:-$HOME/.xclaw/install}"

echo "📥 Cloning xclaw..."
if [ -d "$INSTALL_DIR" ]; then
  cd "$INSTALL_DIR" && git pull
else
  git clone https://github.com/cutd/xclaw.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo "📦 Installing dependencies..."
pnpm install --frozen-lockfile

echo "🔨 Building..."
pnpm build

# Create symlink
LINK_DIR="/usr/local/bin"
if [ -w "$LINK_DIR" ]; then
  ln -sf "$INSTALL_DIR/packages/cli/dist/index.js" "$LINK_DIR/xclaw"
else
  echo "⚠️  Cannot write to $LINK_DIR. Run with sudo or add $INSTALL_DIR/packages/cli/dist/ to PATH."
fi

echo ""
echo "✅ xclaw installed! Run 'xclaw init' to get started."
```

**Step 2: Create Dockerfile**

`Dockerfile`:
```dockerfile
# Stage 1: Build
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ packages/
COPY channels/ channels/
COPY skills/ skills/
RUN pnpm install --frozen-lockfile
RUN pnpm -r build

# Stage 2: Runtime
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=builder /app /app
ENV NODE_ENV=production
EXPOSE 18789
VOLUME /root/.xclaw
ENTRYPOINT ["node", "packages/cli/dist/index.js"]
CMD ["start"]
```

**Step 3: Create docker-compose.yml**

`docker-compose.yml`:
```yaml
version: "3.8"
services:
  xclaw:
    build: .
    ports:
      - "18789:18789"
    volumes:
      - xclaw-data:/root/.xclaw
    environment:
      - XCLAW_ANTHROPIC_KEY=${XCLAW_ANTHROPIC_KEY:-}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
    restart: unless-stopped

volumes:
  xclaw-data:
```

**Step 4: Make install.sh executable and run shellcheck (if available)**

Run: `chmod +x /Users/dateng/cutd_data/dev/xclaw/install.sh`

**Step 5: Commit**

```bash
git add install.sh Dockerfile docker-compose.yml
git commit -m "feat: add deployment files — install.sh, Dockerfile, docker-compose.yml"
```

---

## Summary

After completing all 6 tasks, Phase 7 Automation delivers:

- **Cron Scheduler**: Job store (JSON persistence) + scheduler engine with cron-parser (9 tests)
- **Webhook Engine**: HTTP router with HMAC verification (6 tests)
- **Runtime Integration**: Config types extended, cron + webhook wired into runtime lifecycle
- **CLI Commands**: 8 new commands — init, stop, doctor, config, cron, send, status, sandbox (12+ tests)
- **Chat Commands Skill**: 6 in-chat commands as a skill package (8 tests)
- **Deployment**: install.sh, Dockerfile, docker-compose.yml
