import { BaseChannelPlugin } from '@xclaw/sdk';
import type { BaseChannelConfig } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { randomUUID } from 'node:crypto';

export interface WeComConfig extends BaseChannelConfig {
  corpId: string;
  secret: string;
  agentId: number;
}

export class WeComChannel extends BaseChannelPlugin {
  manifest: PluginManifest = {
    name: 'wecom',
    version: '0.1.0',
    description: 'WeCom channel for xclaw',
    type: 'channel',
  };

  private accessToken = '';
  private readonly config: WeComConfig;

  constructor(config: WeComConfig) {
    super();
    this.config = config;
    if (config.activationMode) {
      this.setActivationMode(config.activationMode);
    }
  }

  async onLoad(): Promise<void> {
    await this.refreshToken();
  }

  async onUnload(): Promise<void> {
    this.accessToken = '';
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const chunks = this.chunkMessage(msg.content.text ?? '', 2048);
    for (const chunk of chunks) {
      try {
        await fetch(
          `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${this.accessToken}`,
          {
            method: 'POST',
            body: JSON.stringify({
              touser: msg.targetUserId,
              msgtype: 'text',
              agentid: this.config.agentId,
              text: { content: chunk },
            }),
          },
        );
      } catch {
        // Platform API error — delivery failure
        break;
      }
    }
  }

  normalizeMessage(raw: Record<string, unknown>): UnifiedMessage {
    return {
      id: randomUUID(),
      source: {
        channel: 'wecom',
        userId: String(raw.FromUserName ?? 'unknown'),
        sessionId: String(raw.FromUserName ?? 'unknown'),
      },
      content: {
        type: 'text',
        text: String(raw.Content ?? ''),
      },
      timestamp: ((raw.CreateTime as number) ?? 0) * 1000,
    };
  }

  private async refreshToken(): Promise<void> {
    try {
      const res = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.corpId}&corpsecret=${this.config.secret}`,
      );
      const data = (await res.json()) as Record<string, unknown>;
      this.accessToken = String(data.access_token ?? '');
    } catch {
      // Token refresh failed — will retry on next reconnect
    }
  }
}
