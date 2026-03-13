import { BaseExtensionPlugin } from '@xclaw/sdk';
import type { PluginManifest, UnifiedMessage, OutgoingMessage } from '@xclaw/core';
import { spawn, type ChildProcess } from 'node:child_process';
import type { SignalConfig } from './types.js';

type MessageHandler = (msg: UnifiedMessage) => Promise<void>;

export class SignalExtension extends BaseExtensionPlugin {
  manifest: PluginManifest = {
    name: 'signal', version: '0.1.0', description: 'Signal channel via signal-cli JSON-RPC',
    type: 'extension', provides: { channels: ['signal'] },
  };

  private config: SignalConfig;
  private process: ChildProcess | null = null;
  protected messageHandler?: MessageHandler;
  private buffer = '';

  constructor(config: SignalConfig) { super(); this.config = config; }

  onMessage(handler: MessageHandler): void { this.messageHandler = handler; }

  async onLoad(): Promise<void> {
    this.process = spawn(this.config.signalCliPath, ['-a', this.config.account, 'jsonRpc']);
    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try { this.handleRpcMessage(JSON.parse(line)); } catch { /* skip */ }
      }
    });
  }

  private async handleRpcMessage(rpc: any): Promise<void> {
    if (!this.messageHandler || rpc.method !== 'receive') return;
    const envelope = rpc.params?.envelope;
    if (!envelope?.dataMessage?.message) return;
    const sender = envelope.source ?? '';
    if (this.config.allowFrom?.length && !this.config.allowFrom.includes(sender) && !this.config.allowFrom.includes('*')) return;
    const unified: UnifiedMessage = {
      id: `signal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: { channel: 'signal', userId: sender, sessionId: `signal-${sender}` },
      content: { type: 'text', text: envelope.dataMessage.message },
      timestamp: envelope.timestamp ?? Date.now(),
    };
    await this.messageHandler(unified);
  }

  async onUnload(): Promise<void> { if (this.process) { this.process.kill(); this.process = null; } }

  async send(msg: OutgoingMessage): Promise<void> {
    if (!this.process?.stdin) throw new Error('Signal not connected');
    this.process.stdin.write(JSON.stringify({
      jsonrpc: '2.0', method: 'send',
      params: { recipient: [msg.targetUserId], message: msg.content.text ?? '' }, id: Date.now(),
    }) + '\n');
  }
}
