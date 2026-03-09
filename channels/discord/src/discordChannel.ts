import { BaseChannelPlugin } from '@xclaw/sdk';
import type { BaseChannelConfig } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { randomUUID } from 'node:crypto';

export interface DiscordConfig extends BaseChannelConfig {
  token: string;
}

export class DiscordChannel extends BaseChannelPlugin {
  manifest: PluginManifest = {
    name: 'discord',
    version: '0.1.0',
    description: 'Discord channel for xclaw',
    type: 'channel',
  };

  private client: Client;
  private readonly config: DiscordConfig;

  constructor(config: DiscordConfig) {
    super();
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel],
    });
    if (config.activationMode) {
      this.setActivationMode(config.activationMode);
    }
  }

  async onLoad(): Promise<void> {
    this.client.on('messageCreate', async (message) => {
      try {
        if (message.author.bot) return;
        const msg = this.normalizeMessage(message);
        const botId = this.client.user?.id ?? '';
        const isMention = this.detectMention(message.content, botId);
        const isReply = message.reference?.messageId !== undefined;
        await this.handleIncoming(msg, { isMention, isReply });
      } catch {
        // Skip malformed message — logged by caller if needed
      }
    });

    await this.client.login(this.config.token);
  }

  async onUnload(): Promise<void> {
    this.client.destroy();
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const channel = await this.client.channels.fetch(msg.targetSessionId);
    if (!channel?.isTextBased()) return;
    const chunks = this.chunkMessage(msg.content.text ?? '', 2000);
    for (const chunk of chunks) {
      try {
        await (channel as any).send(chunk);
      } catch {
        // Platform API error — delivery failure
        break;
      }
    }
  }

  normalizeMessage(raw: Record<string, unknown>): UnifiedMessage {
    const author = raw.author as Record<string, unknown> | undefined;
    return {
      id: randomUUID(),
      source: {
        channel: 'discord',
        userId: String(author?.id ?? 'unknown'),
        sessionId: String(raw.channelId ?? 'unknown'),
      },
      content: {
        type: 'text',
        text: String(raw.content ?? ''),
      },
      timestamp: (raw.createdTimestamp as number) ?? Date.now(),
    };
  }

  detectMention(text: string, botId: string): boolean {
    return text.includes(`<@${botId}>`);
  }
}
