// skills/github/src/githubSkill.ts
import { execFile } from 'node:child_process';
import type { SkillPlugin, PluginManifest, ToolDefinition } from '@xclaw/core';

export class GitHubSkill implements SkillPlugin {
  manifest: PluginManifest = {
    name: 'github',
    version: '0.1.0',
    description: 'Interact with GitHub via the gh CLI',
    type: 'skill',
    permissions: { system: ['exec'], network: ['github.com'] },
  };

  tools: ToolDefinition[] = [
    {
      name: 'github_issue_create',
      description: 'Create a GitHub issue',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } },
        },
        required: ['repo', 'title'],
      },
    },
    {
      name: 'github_issue_list',
      description: 'List GitHub issues',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          state: { type: 'string', enum: ['open', 'closed', 'all'] },
          limit: { type: 'number' },
        },
        required: ['repo'],
      },
    },
    {
      name: 'github_pr_create',
      description: 'Create a pull request',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          base: { type: 'string' },
          head: { type: 'string' },
        },
        required: ['repo', 'title'],
      },
    },
    {
      name: 'github_pr_list',
      description: 'List pull requests',
      inputSchema: {
        type: 'object',
        properties: {
          repo: { type: 'string' },
          state: { type: 'string', enum: ['open', 'closed', 'all'] },
          limit: { type: 'number' },
        },
        required: ['repo'],
      },
    },
    {
      name: 'github_repo_list',
      description: 'List repositories',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number' },
        },
      },
    },
  ];

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'github_issue_create': return this.issueCreate(args);
      case 'github_issue_list': return this.issueList(args);
      case 'github_pr_create': return this.prCreate(args);
      case 'github_pr_list': return this.prList(args);
      case 'github_repo_list': return this.repoList(args);
      default: return { error: `Unknown tool: ${toolName}` };
    }
  }

  private async issueCreate(args: Record<string, unknown>) {
    const ghArgs = ['issue', 'create', '--repo', args.repo as string, '--title', args.title as string];
    if (args.body) ghArgs.push('--body', args.body as string);
    if (args.labels && Array.isArray(args.labels)) {
      for (const label of args.labels as string[]) ghArgs.push('--label', label);
    }
    const result = await this.runGh(ghArgs);
    if (result.error) return result;
    return this.parseJson(result.stdout);
  }

  private async issueList(args: Record<string, unknown>) {
    const ghArgs = ['issue', 'list', '--repo', args.repo as string, '--json', 'number,title,state,url'];
    if (args.state) ghArgs.push('--state', args.state as string);
    ghArgs.push('--limit', String((args.limit as number) ?? 10));
    const result = await this.runGh(ghArgs);
    if (result.error) return result;
    return { issues: this.parseJson(result.stdout) };
  }

  private async prCreate(args: Record<string, unknown>) {
    const ghArgs = ['pr', 'create', '--repo', args.repo as string, '--title', args.title as string];
    if (args.body) ghArgs.push('--body', args.body as string);
    if (args.base) ghArgs.push('--base', args.base as string);
    if (args.head) ghArgs.push('--head', args.head as string);
    const result = await this.runGh(ghArgs);
    if (result.error) return result;
    return this.parseJson(result.stdout);
  }

  private async prList(args: Record<string, unknown>) {
    const ghArgs = ['pr', 'list', '--repo', args.repo as string, '--json', 'number,title,state,url'];
    if (args.state) ghArgs.push('--state', args.state as string);
    ghArgs.push('--limit', String((args.limit as number) ?? 10));
    const result = await this.runGh(ghArgs);
    if (result.error) return result;
    return { pullRequests: this.parseJson(result.stdout) };
  }

  private async repoList(args: Record<string, unknown>) {
    const ghArgs = ['repo', 'list', '--json', 'name,url', '--limit', String((args.limit as number) ?? 20)];
    const result = await this.runGh(ghArgs);
    if (result.error) return result;
    return { repos: this.parseJson(result.stdout) };
  }

  private runGh(args: string[]): Promise<{ stdout: string; error?: string }> {
    return new Promise((resolve) => {
      execFile('gh', args, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ stdout: '', error: stderr?.toString() || error.message });
          return;
        }
        resolve({ stdout: stdout?.toString() ?? '' });
      });
    });
  }

  private parseJson(raw: string): unknown {
    try { return JSON.parse(raw); } catch { return { raw }; }
  }
}
