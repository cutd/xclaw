import { BaseExtensionPlugin } from '@xclaw/sdk';
import type { PluginManifest, UnifiedMessage, OutgoingMessage } from '@xclaw/core';
import type { IMessageConfig } from './types.js';

type MessageHandler = (msg: UnifiedMessage) => Promise<void>;

export class IMessageExtension extends BaseExtensionPlugin {
  manifest: PluginManifest = {
    name: 'imessage', version: '0.1.0', description: 'iMessage channel via BlueBubbles REST API',
    type: 'extension', provides: { channels: ['imessage'] },
  };

  private config: IMessageConfig;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageDate = 0;
  protected messageHandler?: MessageHandler;

  constructor(config: IMessageConfig) { super(); this.config = { pollIntervalMs: 3000, ...config }; }

  onMessage(handler: MessageHandler): void { this.messageHandler = handler; }

  private apiUrl(path: string): string {
    const base = this.config.serverUrl.replace(/\/$/, '');
    const sep = path.includes('?') ? '&' : '?';
    return `${base}${path}${sep}password=${this.config.password}`;
  }

  async onLoad(): Promise<void> {
    this.lastMessageDate = Date.now();
    this.pollTimer = setInterval(async () => {
      try { await this.pollMessages(); } catch { /* retry */ }
    }, this.config.pollIntervalMs);
  }

  private async pollMessages(): Promise<void> {
    if (!this.messageHandler) return;
    const res = await fetch(this.apiUrl('/api/v1/message'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ with: [], after: this.lastMessageDate, limit: 50, sort: 'ASC' }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as any;
    for (const msg of data.data ?? []) {
      if (msg.isFromMe) continue;
      const sender = msg.handle?.address ?? msg.handleId ?? 'unknown';
      if (this.config.allowFrom?.length && !this.config.allowFrom.includes(sender) && !this.config.allowFrom.includes('*')) continue;
      const text = msg.text ?? '';
      if (!text) continue;
      const unified: UnifiedMessage = {
        id: msg.guid ?? `imsg-${Date.now()}`,
        source: { channel: 'imessage', userId: sender, sessionId: `imsg-${msg.chatGuid ?? sender}` },
        content: { type: 'text', text },
        timestamp: msg.dateCreated ?? Date.now(),
      };
      await this.messageHandler(unified);
      if (msg.dateCreated > this.lastMessageDate) this.lastMessageDate = msg.dateCreated;
    }
  }

  async onUnload(): Promise<void> { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } }

  async send(msg: OutgoingMessage): Promise<void> {
    const chatGuid = msg.targetSessionId.replace('imsg-', '');
    await fetch(this.apiUrl('/api/v1/message/text'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatGuid, message: msg.content.text ?? '' }),
    });
  }
}
