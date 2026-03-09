import type { UnifiedMessage, OutgoingMessage, PluginManifest } from '@xclaw/core';

export type MessageHandler = (msg: UnifiedMessage) => Promise<void>;
export type ActivationMode = 'always' | 'mention' | 'reply';

export interface MessageContext {
  isMention: boolean;
  isReply: boolean;
}

export interface ReconnectOptions {
  baseDelay?: number;  // default 1000
  maxDelay?: number;   // default 60000
  factor?: number;     // default 2
}

export interface BaseChannelConfig {
  enabled: boolean;
  activationMode?: ActivationMode;
  maxMessageLength?: number;
  reconnectOptions?: ReconnectOptions;
}

export abstract class BaseChannelPlugin {
  abstract manifest: PluginManifest;

  protected messageHandler?: MessageHandler;
  private activationMode: ActivationMode = 'always';

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  setActivationMode(mode: ActivationMode): void {
    this.activationMode = mode;
  }

  /**
   * Called by channel implementations with incoming messages.
   * Filters based on activation mode before dispatching.
   */
  async handleIncoming(msg: UnifiedMessage, context: MessageContext): Promise<void> {
    if (this.activationMode === 'mention' && !context.isMention) return;
    if (this.activationMode === 'reply' && !context.isReply) return;
    await this.dispatchMessage(msg);
  }

  protected async dispatchMessage(msg: UnifiedMessage): Promise<void> {
    if (this.messageHandler) {
      await this.messageHandler(msg);
    }
  }

  /**
   * Split a long message into chunks respecting maxLength.
   * Tries paragraph boundaries first, then sentence, then hard cut.
   */
  chunkMessage(text: string, maxLength: number): string[] {
    if (maxLength <= 0) throw new Error('maxLength must be positive');
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try paragraph break
      let cutIdx = remaining.lastIndexOf('\n\n', maxLength);
      if (cutIdx > 0) {
        chunks.push(remaining.slice(0, cutIdx).trimEnd());
        remaining = remaining.slice(cutIdx + 2).trimStart();
        continue;
      }

      // Try sentence break
      cutIdx = remaining.lastIndexOf('. ', maxLength);
      if (cutIdx > 0) {
        chunks.push(remaining.slice(0, cutIdx + 1));
        remaining = remaining.slice(cutIdx + 2).trimStart();
        continue;
      }

      // Hard cut
      chunks.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength);
    }

    return chunks;
  }

  /**
   * Get reconnect delay using exponential backoff.
   * Base: 1000ms, factor: 2, max: 60000ms.
   */
  getReconnectDelay(attempt: number, options?: ReconnectOptions): number {
    const base = options?.baseDelay ?? 1000;
    const factor = options?.factor ?? 2;
    const max = options?.maxDelay ?? 60000;
    return Math.min(base * Math.pow(factor, attempt), max);
  }

  abstract onLoad(): Promise<void>;
  abstract onUnload(): Promise<void>;
  abstract send(msg: OutgoingMessage): Promise<void>;
}
