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
    // Give fire-and-forget a tick
    await new Promise((r) => setTimeout(r, 10));
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
    await new Promise((r) => setTimeout(r, 10));
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
