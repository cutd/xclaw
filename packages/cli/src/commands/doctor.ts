import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export async function runDoctorChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const configPath = join(homedir(), '.xclaw', 'xclaw.config.yaml');
  results.push({
    name: 'Config file',
    status: existsSync(configPath) ? 'pass' : 'fail',
    message: existsSync(configPath) ? configPath : 'Not found. Run "xclaw init".',
  });

  const hasKey = !!(process.env.XCLAW_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY);
  results.push({
    name: 'API key',
    status: hasKey ? 'pass' : 'warn',
    message: hasKey ? 'Found in environment' : 'No XCLAW_ANTHROPIC_KEY or ANTHROPIC_API_KEY set.',
  });

  const memDir = join(homedir(), '.xclaw', 'memory');
  results.push({
    name: 'Memory storage',
    status: existsSync(memDir) ? 'pass' : 'warn',
    message: existsSync(memDir) ? memDir : 'Not found. Will be created on first use.',
  });

  const nodeVersion = parseInt(process.version.slice(1), 10);
  results.push({
    name: 'Node.js version',
    status: nodeVersion >= 22 ? 'pass' : 'fail',
    message: `${process.version} (requires >= 22)`,
  });

  return results;
}

export function formatDoctorResults(results: CheckResult[]): string {
  const icons = { pass: '\u2705', fail: '\u274C', warn: '\u26A0\uFE0F' };
  return results.map((r) => `${icons[r.status]} ${r.name}: ${r.message}`).join('\n');
}
