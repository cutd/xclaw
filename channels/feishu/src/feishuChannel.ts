import { BaseChannelPlugin } from '@xclaw/sdk';
import type { BaseChannelConfig } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import * as lark from '@larksuiteoapi/node-sdk';
import { randomUUID } from 'node:crypto';

export interface FeishuConfig extends BaseChannelConfig {
  appId: string;
  appSecret: string;
}

export class FeishuChannel extends BaseChannelPlugin {
  manifest: PluginManifest = {
    name: 'feishu',
    version: '0.1.0',
    description: 'Feishu (Lark) channel for xclaw',
    type: 'channel',
  };

  private client: lark.Client;
  private readonly config: FeishuConfig;

  constructor(config: FeishuConfig) {
    super();
    this.config = config;
    this.client = new lark.Client({
      appId: config.appId,
      appSecret: config.appSecret,
    });
    if (config.activationMode) {
      this.setActivationMode(config.activationMode);
    }
  }

  async onLoad(): Promise<void> {
    /* EventDispatcher setup — webhook or long poll */
  }

  async onUnload(): Promise<void> {
    /* cleanup */
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const chunks = this.chunkMessage(msg.content.text ?? '', 4096);
    for (const chunk of chunks) {
      try {
        await this.client.im.message.create({
          data: {
            receive_id: msg.targetSessionId,
            msg_type: 'text',
            content: JSON.stringify({ text: chunk }),
          },
          params: { receive_id_type: 'chat_id' },
        });
      } catch {
        // Platform API error — delivery failure
        break;
      }
    }
  }

  /**
   * Handle an incoming Feishu webhook event.
   * Parses `im.message.receive_v1` events into a UnifiedMessage
   * and dispatches them through the registered message handler.
   */
  async handleWebhookEvent(payload: Record<string, unknown>): Promise<void> {
    const header = payload.header as Record<string, unknown> | undefined;
    if (!header || header.event_type !== 'im.message.receive_v1') {
      return;
    }

    const event = payload.event as Record<string, unknown> | undefined;
    if (!event) {
      return;
    }

    const unified = this.normalizeMessage(event);
    await this.dispatchMessage(unified);
  }

  normalizeMessage(raw: Record<string, unknown>): UnifiedMessage {
    const sender = raw.sender as Record<string, any> | undefined;
    const message = raw.message as Record<string, any> | undefined;

    let text = '';
    try {
      text = JSON.parse(message?.content ?? '{}').text ?? '';
    } catch {
      /* ignore malformed content */
    }

    return {
      id: randomUUID(),
      source: {
        channel: 'feishu',
        userId: sender?.sender_id?.open_id ?? 'unknown',
        sessionId: message?.chat_id ?? 'unknown',
      },
      content: {
        type: 'text',
        text,
      },
      timestamp: parseInt(message?.create_time ?? '0', 10),
    };
  }
}
