import { BaseExtensionPlugin } from '@xclaw/sdk';
import type { PluginManifest, UnifiedMessage, OutgoingMessage } from '@xclaw/core';
import type { IrcConfig } from './types.js';

type MessageHandler = (msg: UnifiedMessage) => Promise<void>;

export class IrcExtension extends BaseExtensionPlugin {
  manifest: PluginManifest = {
    name: 'irc',
    version: '0.1.0',
    description: 'IRC channel via irc-framework',
    type: 'extension',
    provides: { channels: ['irc'] },
    permissions: { network: ['*'] },
  };

  private config: IrcConfig;
  private client: any = null;
  protected messageHandler?: MessageHandler;

  constructor(config: IrcConfig) {
    super();
    this.config = config;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async onLoad(): Promise<void> {
    const ircFramework = await import('irc-framework');
    const Client = ircFramework.default?.Client ?? ircFramework.Client;
    this.client = new Client();

    this.client.connect({
      host: this.config.host,
      port: this.config.port,
      nick: this.config.nick,
      tls: this.config.tls ?? false,
      password: this.config.password,
    });

    this.client.on('registered', () => {
      for (const channel of this.config.channels) {
        this.client.join(channel);
      }
    });

    this.client.on('privmsg', (event: any) => {
      if (!this.messageHandler) return;
      const sender = event.nick ?? '';
      if (
        this.config.allowFrom?.length &&
        !this.config.allowFrom.includes(sender) &&
        !this.config.allowFrom.includes('*')
      ) return;

      const text = event.message ?? '';
      if (!text) return;

      const target = event.target ?? sender;
      const unified: UnifiedMessage = {
        id: `irc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source: {
          channel: 'irc',
          userId: sender,
          sessionId: `irc-${target}`,
        },
        content: { type: 'text', text },
        timestamp: Date.now(),
      };
      this.messageHandler(unified);
    });
  }

  async onUnload(): Promise<void> {
    if (this.client) {
      this.client.quit('Goodbye');
      this.client = null;
    }
  }

  async send(msg: OutgoingMessage): Promise<void> {
    if (!this.client) throw new Error('IRC not connected');
    const target = msg.targetSessionId.replace('irc-', '');
    this.client.say(target, msg.content.text ?? '');
  }
}
