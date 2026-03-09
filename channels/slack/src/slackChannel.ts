import { BaseChannelPlugin } from '@xclaw/sdk';
import type { BaseChannelConfig } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { App } from '@slack/bolt';
import { randomUUID } from 'node:crypto';

export interface SlackConfig extends BaseChannelConfig {
  token: string;
  appToken: string;
  signingSecret: string;
}

export class SlackChannel extends BaseChannelPlugin {
  manifest: PluginManifest = {
    name: 'slack',
    version: '0.1.0',
    description: 'Slack channel for xclaw',
    type: 'channel',
  };

  private app: App;
  private readonly config: SlackConfig;

  constructor(config: SlackConfig) {
    super();
    this.config = config;
    this.app = new App({
      token: config.token,
      appToken: config.appToken,
      signingSecret: config.signingSecret,
      socketMode: true,
    });
    if (config.activationMode) this.setActivationMode(config.activationMode);
  }

  async onLoad(): Promise<void> {
    this.app.message(async ({ message }) => {
      try {
        const m = message as Record<string, unknown>;
        if (m.subtype) return;
        const msg = this.normalizeMessage(m);
        const isMention = this.detectMention(String(m.text ?? ''), '');
        const isReply = !!(m.thread_ts && m.thread_ts !== m.ts);
        await this.handleIncoming(msg, { isMention, isReply });
      } catch {
        // Skip malformed message
      }
    });
    await this.app.start();
  }

  async onUnload(): Promise<void> {
    await this.app.stop();
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const chunks = this.chunkMessage(msg.content.text ?? '', 40000);
    for (const chunk of chunks) {
      try {
        await this.app.client.chat.postMessage({
          channel: msg.targetSessionId,
          text: chunk,
        });
      } catch {
        break;
      }
    }
  }

  normalizeMessage(raw: Record<string, unknown>): UnifiedMessage {
    return {
      id: randomUUID(),
      source: {
        channel: 'slack',
        userId: String(raw.user ?? 'unknown'),
        sessionId: String(raw.channel ?? 'unknown'),
      },
      content: {
        type: 'text',
        text: String(raw.text ?? ''),
      },
      timestamp: Math.floor(parseFloat(String(raw.ts ?? '0')) * 1000),
    };
  }

  detectMention(text: string, botId: string): boolean {
    return /<@[A-Z0-9_]+>/.test(text);
  }
}
