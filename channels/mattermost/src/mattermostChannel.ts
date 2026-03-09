import { BaseChannelPlugin } from '@xclaw/sdk';
import type { BaseChannelConfig } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { Client4, WebSocketClient } from '@mattermost/client';
import { randomUUID } from 'node:crypto';

export interface MattermostConfig extends BaseChannelConfig {
  url: string;
  token: string;
}

export class MattermostChannel extends BaseChannelPlugin {
  manifest: PluginManifest = {
    name: 'mattermost',
    version: '0.1.0',
    description: 'Mattermost channel for xclaw',
    type: 'channel',
  };

  private client: Client4;
  private ws: WebSocketClient | null = null;
  private readonly config: MattermostConfig;

  constructor(config: MattermostConfig) {
    super();
    this.config = config;
    this.client = new Client4();
    this.client.setUrl(config.url);
    this.client.setToken(config.token);
    if (config.activationMode) this.setActivationMode(config.activationMode);
  }

  async onLoad(): Promise<void> {
    this.ws = new WebSocketClient();
    const me = await this.client.getMe();

    this.ws.addMessageListener(async (event: Record<string, unknown>) => {
      try {
        const data = (event.data ?? event) as Record<string, unknown>;
        const post = typeof data.post === 'string' ? JSON.parse(data.post) : data;
        if (post.user_id === me.id) return;

        const msg = this.normalizeMessage(post);
        const isMention = String(post.message ?? '').includes(`@${me.username}`);
        const isReply = !!post.root_id;
        await this.handleIncoming(msg, { isMention, isReply });
      } catch {
        // Skip malformed message
      }
    });

    await this.ws.initialize(
      `${this.config.url}/api/v4/websocket`,
      this.config.token,
    );
  }

  async onUnload(): Promise<void> {
    this.ws?.close();
    this.ws = null;
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const chunks = this.chunkMessage(msg.content.text ?? '', 16383);
    for (const chunk of chunks) {
      try {
        await this.client.createPost({
          channel_id: msg.targetSessionId,
          message: chunk,
        } as any);
      } catch {
        break;
      }
    }
  }

  normalizeMessage(raw: Record<string, unknown>): UnifiedMessage {
    return {
      id: randomUUID(),
      source: {
        channel: 'mattermost',
        userId: String(raw.user_id ?? 'unknown'),
        sessionId: String(raw.channel_id ?? 'unknown'),
      },
      content: { type: 'text', text: String(raw.message ?? '') },
      timestamp: (raw.create_at as number) ?? Date.now(),
    };
  }
}
