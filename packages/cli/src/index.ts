import { Command } from 'commander';
import { startCommand } from './commands/start.js';
import { searchSkills, installSkill } from './commands/skill.js';
import { formatMemoryFile } from './commands/memory.js';
import { formatChannelList } from './commands/channel.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const program = new Command();

program
  .name('xclaw')
  .description('🦞 xclaw — Your AI assistant gateway')
  .version('0.1.0');

program
  .command('start')
  .description('Start the xclaw gateway')
  .option('-k, --api-key <key>', 'LLM provider API key (or set XCLAW_ANTHROPIC_KEY)')
  .option('-m, --model <model>', 'Default model to use', 'claude-sonnet-4-5')
  .action(async (opts) => {
    const apiKey = opts.apiKey || process.env.XCLAW_ANTHROPIC_KEY;
    if (!apiKey) {
      console.error('❌ 需要 API Key。使用 --api-key 参数或设置 XCLAW_ANTHROPIC_KEY 环境变量');
      process.exit(1);
    }
    await startCommand({ apiKey, model: opts.model });
  });

const skillCmd = program
  .command('skill')
  .description('Manage xclaw skills (search, install, list)');

skillCmd
  .command('search <query>')
  .description('Search ClawHub for skills')
  .action(async (query: string) => {
    await searchSkills(query);
  });

skillCmd
  .command('install <name>')
  .description('Install a skill from ClawHub')
  .action(async (name: string) => {
    await installSkill(name);
  });

const memoryCmd = program
  .command('memory')
  .description('Manage xclaw memory (search, show, import)');

memoryCmd
  .command('show')
  .description('Display MEMORY.md contents')
  .action(async () => {
    const memoryPath = join(homedir(), '.xclaw', 'memory', 'MEMORY.md');
    try {
      const content = await readFile(memoryPath, 'utf-8');
      console.log(formatMemoryFile(content));
    } catch {
      console.log('No memory file found. Start a conversation to create memories.');
    }
  });

memoryCmd
  .command('search <query>')
  .description('Search memories')
  .action(async (query: string) => {
    console.log(`Searching memories for: ${query}`);
    console.log('Memory search requires a running xclaw instance. Use "xclaw start" first.');
  });

const channelCmd = program
  .command('channel')
  .description('Manage xclaw channels (list, enable, disable)');

channelCmd
  .command('list')
  .description('List installed channels and their status')
  .action(async () => {
    const configPath = join(homedir(), '.xclaw', 'xclaw.config.yaml');
    try {
      const content = await readFile(configPath, 'utf-8');
      // Simple YAML parsing for channel list
      const channelSection = content.match(/channels:\n([\s\S]*?)(?=\n\w|\n$|$)/);
      if (!channelSection) {
        console.log('No channels configured.');
        return;
      }
      const channels: { name: string; enabled: boolean }[] = [];
      const entries = channelSection[1].matchAll(/- name: (\S+)\n\s+enabled: (true|false)/g);
      for (const match of entries) {
        channels.push({ name: match[1], enabled: match[2] === 'true' });
      }
      console.log(formatChannelList(channels));
    } catch {
      console.log('No configuration file found. Run "xclaw start" to create one.');
    }
  });

channelCmd
  .command('enable <name>')
  .description('Enable a channel')
  .action(async (name: string) => {
    console.log(`Enabling channel: ${name}`);
    console.log('Update your xclaw.config.yaml to set enabled: true for this channel.');
  });

channelCmd
  .command('disable <name>')
  .description('Disable a channel')
  .action(async (name: string) => {
    console.log(`Disabling channel: ${name}`);
    console.log('Update your xclaw.config.yaml to set enabled: false for this channel.');
  });

program.parse();
