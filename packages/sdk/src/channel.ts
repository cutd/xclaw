import type { UnifiedMessage, OutgoingMessage, PluginManifest } from '@xclaw/core';

export type MessageHandler = (msg: UnifiedMessage) => Promise<void>;

export abstract class BaseChannelPlugin {
  abstract manifest: PluginManifest;

  protected messageHandler?: MessageHandler;

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  protected async dispatchMessage(msg: UnifiedMessage): Promise<void> {
    if (this.messageHandler) {
      await this.messageHandler(msg);
    }
  }

  abstract onLoad(): Promise<void>;
  abstract onUnload(): Promise<void>;
  abstract send(msg: OutgoingMessage): Promise<void>;
}
