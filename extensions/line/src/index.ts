import { BaseExtensionPlugin } from '@xclaw/sdk';
import type { PluginManifest, UnifiedMessage, OutgoingMessage } from '@xclaw/core';
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHmac } from 'node:crypto';
import type { LineConfig } from './types.js';

type MessageHandler = (msg: UnifiedMessage) => Promise<void>;

export class LineExtension extends BaseExtensionPlugin {
  manifest: PluginManifest = {
    name: 'line',
    version: '0.1.0',
    description: 'LINE channel via Messaging API webhook',
    type: 'extension',
    provides: { channels: ['line'] },
    permissions: { network: ['api.line.me'] },
  };

  private config: LineConfig;
  private server: Server | null = null;
  protected messageHandler?: MessageHandler;

  constructor(config: LineConfig) {
    super();
    this.config = { webhookPort: 18790, ...config };
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  verifySignature(body: string, signature: string): boolean {
    const hash = createHmac('SHA256', this.config.channelSecret)
      .update(body)
      .digest('base64');
    return hash === signature;
  }

  async onLoad(): Promise<void> {
    this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST' || req.url !== '/webhook') {
        res.writeHead(404);
        res.end();
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const rawBody = Buffer.concat(chunks).toString('utf-8');
      const signature = req.headers['x-line-signature'] as string | undefined;

      if (!signature || !this.verifySignature(rawBody, signature)) {
        res.writeHead(403);
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');

      if (!this.messageHandler) return;

      try {
        const payload = JSON.parse(rawBody);
        for (const event of payload.events ?? []) {
          if (event.type !== 'message' || event.message?.type !== 'text') continue;
          const sender = event.source?.userId ?? 'unknown';
          if (
            this.config.allowFrom?.length &&
            !this.config.allowFrom.includes(sender) &&
            !this.config.allowFrom.includes('*')
          ) continue;

          const unified: UnifiedMessage = {
            id: event.message.id ?? `line-${Date.now()}`,
            source: {
              channel: 'line',
              userId: sender,
              sessionId: `line-${event.source?.roomId ?? event.source?.groupId ?? sender}`,
            },
            content: { type: 'text', text: event.message.text },
            timestamp: event.timestamp ?? Date.now(),
          };
          await this.messageHandler(unified);
        }
      } catch { /* skip malformed */ }
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(this.config.webhookPort, () => resolve());
    });
  }

  async onUnload(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((err) => (err ? reject(err) : resolve()));
      });
      this.server = null;
    }
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.channelAccessToken}`,
      },
      body: JSON.stringify({
        to: msg.targetUserId,
        messages: [{ type: 'text', text: msg.content.text ?? '' }],
      }),
    });
    if (!res.ok) {
      throw new Error(`LINE API error: ${res.status} ${res.statusText}`);
    }
  }
}
