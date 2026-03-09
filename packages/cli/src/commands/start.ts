import { XClawRuntime } from '@xclaw/core';
import { CLIChannel } from '../channel/cliChannel.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { UnifiedMessage } from '@xclaw/core';

export interface StartOptions {
  apiKey: string;
  model?: string;
  provider?: string;
  config?: string;
}

export function resolveConfigPath(override?: string): string {
  if (override) return override;
  if (process.env.XCLAW_CONFIG) return process.env.XCLAW_CONFIG;
  return join(homedir(), '.xclaw', 'xclaw.config.yaml');
}

export async function startCommand(options: StartOptions): Promise<void> {
  console.log('🦞 xclaw starting...\n');

  const configPath = resolveConfigPath(options.config);
  const runtime = new XClawRuntime();
  await runtime.loadConfig(configPath);
  await runtime.start({ skipGateway: false });

  // CLI channel is always loaded
  const cliChannel = new CLIChannel();
  const pipeline = runtime.getPipeline();

  if (pipeline) {
    cliChannel.onMessage(async (msg: UnifiedMessage) => {
      if (msg.content.type !== 'text' || !msg.content.text) return;
      try {
        const result = await pipeline.process(msg);
        await cliChannel.send({
          targetChannel: 'cli',
          targetUserId: 'local',
          targetSessionId: msg.source.sessionId,
          content: { type: 'text', text: result.content },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        await cliChannel.send({
          targetChannel: 'cli',
          targetUserId: 'local',
          targetSessionId: msg.source.sessionId,
          content: { type: 'text', text: `❌ 请求失败: ${errMsg}` },
        });
      }
      cliChannel.prompt();
    });
  }

  await cliChannel.onLoad();

  const status = runtime.getStatus();
  const channelList = status.channels.length > 0 ? ` (channels: ${status.channels.join(', ')})` : '';
  console.log(`✅ xclaw 已就绪!${channelList} 输入消息开始对话，/quit 退出\n`);
  cliChannel.prompt();

  process.on('SIGINT', async () => {
    console.log('\n🦞 Shutting down...');
    await cliChannel.onUnload();
    await runtime.stop();
    process.exit(0);
  });
}
