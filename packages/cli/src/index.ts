import { Command } from 'commander';
import { startCommand } from './commands/start.js';

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

program.parse();
