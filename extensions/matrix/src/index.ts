import { BaseExtensionPlugin } from '@xclaw/sdk';
import type { PluginManifest, UnifiedMessage, OutgoingMessage } from '@xclaw/core';
import type { MatrixConfig } from './types.js';

type MessageHandler = (msg: UnifiedMessage) => Promise<void>;

export class MatrixExtension extends BaseExtensionPlugin {
  manifest: PluginManifest = {
    name: 'matrix',
    version: '0.1.0',
    description: 'Matrix channel via matrix-js-sdk',
    type: 'extension',
    provides: { channels: ['matrix'] },
    permissions: { network: ['*'] },
  };

  private config: MatrixConfig;
  private client: any = null;
  protected messageHandler?: MessageHandler;

  constructor(config: MatrixConfig) {
    super();
    this.config = config;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async onLoad(): Promise<void> {
    const sdk = await import('matrix-js-sdk');
    this.client = sdk.createClient({
      baseUrl: this.config.homeserverUrl,
      userId: this.config.userId,
      accessToken: this.config.accessToken,
    });

    this.client.on('Room.timeline', (event: any, room: any) => {
      if (!this.messageHandler) return;
      if (event.getType() !== 'm.room.message') return;
      const sender = event.getSender();
      if (sender === this.config.userId) return;
      if (
        this.config.allowFrom?.length &&
        !this.config.allowFrom.includes(sender) &&
        !this.config.allowFrom.includes('*')
      ) return;

      const content = event.getContent();
      const text = content.body ?? '';
      if (!text) return;

      const roomId = room.roomId ?? event.getRoomId();
      const unified: UnifiedMessage = {
        id: event.getId() ?? `matrix-${Date.now()}`,
        source: {
          channel: 'matrix',
          userId: sender,
          sessionId: `matrix-${roomId}`,
        },
        content: { type: 'text', text },
        timestamp: event.getTs() ?? Date.now(),
      };
      this.messageHandler(unified);
    });

    await this.client.startClient();
  }

  async onUnload(): Promise<void> {
    if (this.client) {
      this.client.stopClient();
      this.client = null;
    }
  }

  async send(msg: OutgoingMessage): Promise<void> {
    if (!this.client) throw new Error('Matrix not connected');
    const roomId = msg.targetSessionId.replace('matrix-', '');
    await this.client.sendTextMessage(roomId, msg.content.text ?? '');
  }
}
