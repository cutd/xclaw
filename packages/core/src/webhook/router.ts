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
