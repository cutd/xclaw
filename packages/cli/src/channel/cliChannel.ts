import { BaseChannelPlugin } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { randomUUID } from 'node:crypto';
import * as readline from 'node:readline';

export class CLIChannel extends BaseChannelPlugin {
  manifest: PluginManifest = {
    name: 'cli',
    version: '0.1.0',
    description: 'Terminal CLI channel for xclaw',
    type: 'channel',
  };

  private rl?: readline.Interface;
  private sessionId = `cli-${randomUUID().slice(0, 8)}`;

  async onLoad(): Promise<void> {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed === '/quit' || trimmed === '/exit') {
        await this.onUnload();
        process.exit(0);
      }

      const msg: UnifiedMessage = {
        id: randomUUID(),
        source: {
          channel: 'cli',
          userId: 'local',
          sessionId: this.sessionId,
        },
        content: { type: 'text', text: trimmed },
        timestamp: Date.now(),
      };
      await this.dispatchMessage(msg);
    });
  }

  async onUnload(): Promise<void> {
    this.rl?.close();
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const output = this.formatOutput(msg);
    console.log(output);
  }

  formatOutput(msg: OutgoingMessage): string {
    if (msg.content.type === 'text' && msg.content.text) {
      return msg.content.text;
    }
    return JSON.stringify(msg.content);
  }

  prompt(): void {
    process.stdout.write('\n> ');
  }
}
