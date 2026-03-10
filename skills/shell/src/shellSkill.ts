// skills/shell/src/shellSkill.ts
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import type { SkillPlugin, PluginManifest, ToolDefinition } from '@xclaw/core';

export class ShellSkill implements SkillPlugin {
  manifest: PluginManifest = {
    name: 'shell',
    version: '0.1.0',
    description: 'Execute shell commands',
    type: 'skill',
    permissions: { system: ['exec'] },
  };

  tools: ToolDefinition[] = [
    {
      name: 'shell_exec',
      description: 'Execute a shell command and return stdout, stderr, and exit code',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The command to execute' },
          cwd: { type: 'string', description: 'Working directory (defaults to $HOME)' },
          timeout: { type: 'number', description: 'Timeout in ms (defaults to 30000)' },
        },
        required: ['command'],
      },
    },
  ];

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (toolName !== 'shell_exec') {
      return { error: `Unknown tool: ${toolName}` };
    }

    const command = args.command as string;
    if (!command) {
      return { error: 'Command is required' };
    }

    const cwd = (args.cwd as string) ?? homedir();
    const timeout = (args.timeout as number) ?? 30000;

    const tokens = this.tokenize(command);
    if (tokens.length === 0) {
      return { error: 'Command is empty' };
    }

    const [bin, ...cmdArgs] = tokens;

    return new Promise((resolve) => {
      execFile(bin, cmdArgs, { cwd, timeout }, (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).killed) {
          resolve({ stdout: stdout?.toString() ?? '', stderr: 'Command timed out', exitCode: 1 });
          return;
        }
        const code = error ? (error as NodeJS.ErrnoException & { code?: number }).code : 0;
        resolve({
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          exitCode: typeof code === 'number' ? code : 1,
        });
      });
    });
  }

  // Simplified tokenizer: splits on whitespace, respects single/double quotes.
  // Does NOT handle backslash escapes. Unclosed quotes are treated as closed at end-of-string.
  private tokenize(command: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote: string | null = null;

    for (const ch of command) {
      if (inQuote) {
        if (ch === inQuote) { inQuote = null; }
        else { current += ch; }
      } else if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === ' ' || ch === '\t') {
        if (current) { tokens.push(current); current = ''; }
      } else {
        current += ch;
      }
    }
    if (current) tokens.push(current);
    return tokens;
  }
}
