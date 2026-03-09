import { BaseChannelPlugin } from '@xclaw/sdk';
import type { BaseChannelConfig } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { google } from 'googleapis';
import { randomUUID } from 'node:crypto';

export interface GChatConfig extends BaseChannelConfig {
  serviceAccountKey: string;
}

export class GChatChannel extends BaseChannelPlugin {
  manifest: PluginManifest = {
    name: 'gchat',
    version: '0.1.0',
    description: 'Google Chat channel for xclaw',
    type: 'channel',
  };

  private chat: ReturnType<typeof google.chat> | null = null;
  private readonly config: GChatConfig;

  constructor(config: GChatConfig) {
    super();
    this.config = config;
    if (config.activationMode) this.setActivationMode(config.activationMode);
  }

  async onLoad(): Promise<void> {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(this.config.serviceAccountKey),
      scopes: ['https://www.googleapis.com/auth/chat.bot'],
    });
    this.chat = google.chat({ version: 'v1', auth });
  }

  async onUnload(): Promise<void> {
    this.chat = null;
  }

  async send(msg: OutgoingMessage): Promise<void> {
    if (!this.chat) return;
    const chunks = this.chunkMessage(msg.content.text ?? '', 4096);
    for (const chunk of chunks) {
      try {
        await this.chat.spaces.messages.create({
          parent: msg.targetSessionId,
          requestBody: { text: chunk },
        });
      } catch {
        break;
      }
    }
  }

  normalizeMessage(raw: Record<string, unknown>): UnifiedMessage {
    const sender = raw.sender as Record<string, unknown> | undefined;
    const space = raw.space as Record<string, unknown> | undefined;
    return {
      id: randomUUID(),
      source: {
        channel: 'gchat',
        userId: String(sender?.name ?? 'unknown'),
        sessionId: String(space?.name ?? 'unknown'),
      },
      content: { type: 'text', text: String(raw.text ?? '') },
      timestamp: raw.createTime
        ? new Date(String(raw.createTime)).getTime()
        : Date.now(),
    };
  }
}
