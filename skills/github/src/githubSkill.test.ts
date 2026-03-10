import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubSkill } from './githubSkill.js';
import * as cp from 'node:child_process';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(cp.execFile);

function simulateExecFile(stdout: string, stderr = '', exitCode = 0) {
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
    callback(exitCode ? new Error('fail') : null, stdout, stderr);
    return {} as any;
  });
}

describe('GitHubSkill', () => {
  const skill = new GitHubSkill();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('manifest', () => {
    it('should have correct type and name', () => {
      expect(skill.manifest.type).toBe('skill');
      expect(skill.manifest.name).toBe('github');
      expect(skill.manifest.permissions?.system).toContain('exec');
      expect(skill.manifest.permissions?.network).toContain('github.com');
    });
  });

  describe('tools', () => {
    it('should expose 5 tools', () => {
      expect(skill.tools).toHaveLength(5);
      const names = skill.tools.map((t) => t.name);
      expect(names).toContain('github_issue_create');
      expect(names).toContain('github_issue_list');
      expect(names).toContain('github_pr_create');
      expect(names).toContain('github_pr_list');
      expect(names).toContain('github_repo_list');
    });
  });

  describe('github_issue_list', () => {
    it('should call gh issue list with correct args', async () => {
      simulateExecFile(JSON.stringify([{ number: 1, title: 'Bug', state: 'OPEN', url: 'https://github.com/foo/bar/issues/1' }]));
      const result = await skill.execute('github_issue_list', { repo: 'foo/bar' }) as any;
      expect(mockExecFile).toHaveBeenCalledWith('gh', expect.arrayContaining(['issue', 'list', '--repo', 'foo/bar', '--json']), expect.any(Object), expect.any(Function));
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].title).toBe('Bug');
    });
  });

  describe('github_issue_create', () => {
    it('should call gh issue create with correct args', async () => {
      simulateExecFile(JSON.stringify({ number: 42, url: 'https://github.com/foo/bar/issues/42' }));
      const result = await skill.execute('github_issue_create', { repo: 'foo/bar', title: 'New bug', body: 'Details here' }) as any;
      expect(mockExecFile).toHaveBeenCalledWith('gh', expect.arrayContaining(['issue', 'create', '--repo', 'foo/bar', '--title', 'New bug']), expect.any(Object), expect.any(Function));
      expect(result.url).toContain('github.com');
    });
  });

  describe('github_pr_list', () => {
    it('should call gh pr list with correct args', async () => {
      simulateExecFile(JSON.stringify([{ number: 10, title: 'Fix', state: 'OPEN', url: 'https://github.com/foo/bar/pull/10' }]));
      const result = await skill.execute('github_pr_list', { repo: 'foo/bar' }) as any;
      expect(result.pullRequests).toHaveLength(1);
    });
  });

  describe('github_repo_list', () => {
    it('should call gh repo list', async () => {
      simulateExecFile(JSON.stringify([{ name: 'my-repo', url: 'https://github.com/user/my-repo' }]));
      const result = await skill.execute('github_repo_list', {}) as any;
      expect(result.repos).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should return error for unknown tool', async () => {
      const result = await skill.execute('unknown', {}) as any;
      expect(result).toHaveProperty('error');
    });

    it('should handle gh CLI failure gracefully', async () => {
      simulateExecFile('', 'gh: command not found', 1);
      const result = await skill.execute('github_issue_list', { repo: 'foo/bar' }) as any;
      expect(result).toHaveProperty('error');
    });
  });
});
