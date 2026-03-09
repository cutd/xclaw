import { BaseChannelPlugin } from '@xclaw/sdk';
import type { BaseChannelConfig } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { CloudAdapter, ConfigurationBotFrameworkAuthentication } from 'botbuilder';
import { randomUUID } from 'node:crypto';

export interface TeamsConfig extends BaseChannelConfig {
  appId: string;
  appPassword: string;
}

export class TeamsChannel extends BaseChannelPlugin {
  manifest: PluginManifest = { name: 'teams', version: '0.1.0', description: 'Microsoft Teams channel for xclaw', type: 'channel' };
  private adapter: CloudAdapter | null = null;
  private readonly config: TeamsConfig;

  constructor(config: TeamsConfig) {
    super();
    this.config = config;
    if (config.activationMode) this.setActivationMode(config.activationMode);
  }

  async onLoad(): Promise<void> {
    const auth = new ConfigurationBotFrameworkAuthentication({}, { MicrosoftAppId: this.config.appId, MicrosoftAppPassword: this.config.appPassword });
    this.adapter = new CloudAdapter(auth);
  }

  async onUnload(): Promise<void> {
    this.adapter = null;
  }

  async send(msg: OutgoingMessage): Promise<void> {
    if (!this.adapter) return;
    const chunks = this.chunkMessage(msg.content.text ?? '', 28000);
    for (const chunk of chunks) {
      try {
        // In production, use continueConversationAsync with stored conversation reference
        await this.adapter.continueConversationAsync(this.config.appId, { conversation: { id: msg.targetSessionId } } as any, async (ctx) => {
          await ctx.sendActivity(chunk);
        });
      } catch { break; }
    }
  }

  normalizeMessage(raw: Record<string, unknown>): UnifiedMessage {
    const from = raw.from as Record<string, unknown> | undefined;
    const conversation = raw.conversation as Record<string, unknown> | undefined;
    return {
      id: randomUUID(),
      source: {
        channel: 'teams',
        userId: String(from?.id ?? 'unknown'),
        sessionId: String(conversation?.id ?? 'unknown'),
      },
      content: { type: 'text', text: String(raw.text ?? '') },
      timestamp: raw.timestamp ? new Date(String(raw.timestamp)).getTime() : Date.now(),
    };
  }
}
