import { BaseChannelPlugin } from '@xclaw/sdk';
import type { BaseChannelConfig } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { Telegraf } from 'telegraf';
import { randomUUID } from 'node:crypto';

export interface TelegramConfig extends BaseChannelConfig {
  token: string;
}

export class TelegramChannel extends BaseChannelPlugin {
  manifest: PluginManifest = {
    name: 'telegram',
    version: '0.1.0',
    description: 'Telegram channel for xclaw',
    type: 'channel',
  };

  private bot: Telegraf;
  private readonly config: TelegramConfig;

  constructor(config: TelegramConfig) {
    super();
    this.config = config;
    this.bot = new Telegraf(config.token);
    if (config.activationMode) {
      this.setActivationMode(config.activationMode);
    }
  }

  async onLoad(): Promise<void> {
    this.bot.on('text', async (ctx) => {
      try {
        const msg = this.normalizeMessage(ctx);
        const botUsername = this.bot.botInfo?.username ?? '';
        const isMention = this.detectMention(ctx.message.text ?? '', botUsername);
        const isReply = ctx.message.reply_to_message?.from?.id === this.bot.botInfo?.id;
        await this.handleIncoming(msg, { isMention, isReply });
      } catch {
        // Skip malformed message — logged by caller if needed
      }
    });

    await this.bot.launch();
  }

  async onUnload(): Promise<void> {
    this.bot.stop();
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const chatId = msg.targetSessionId;
    const text = msg.content.text ?? '';
    const chunks = this.chunkMessage(text, 4096);
    for (const chunk of chunks) {
      try {
        await this.bot.telegram.sendMessage(chatId, chunk);
      } catch {
        // Platform API error — delivery failure
        break;
      }
    }
  }

  normalizeMessage(ctx: Record<string, unknown>): UnifiedMessage {
    const message = (ctx.message ?? ctx) as Record<string, unknown>;
    const from = message.from as Record<string, unknown> | undefined;
    const chat = message.chat as Record<string, unknown> | undefined;

    return {
      id: randomUUID(),
      source: {
        channel: 'telegram',
        userId: String(from?.id ?? 'unknown'),
        sessionId: String(chat?.id ?? 'unknown'),
      },
      content: {
        type: 'text',
        text: (message.text as string) ?? '',
      },
      timestamp: ((message.date as number) ?? Math.floor(Date.now() / 1000)) * 1000,
    };
  }

  detectMention(text: string, botUsername: string): boolean {
    if (!botUsername) return false;
    return text.includes(`@${botUsername}`);
  }
}
