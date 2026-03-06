import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeCodeAdapter } from './claudeCodeAdapter.js';

describe('ClaudeCodeAdapter', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'xclaw-claude-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should detect Claude Code skills from .claude/ directory', async () => {
    const claudeDir = join(testDir, '.claude');
    const skillsDir = join(claudeDir, 'skills');
    await mkdir(skillsDir, { recursive: true });
    await writeFile(join(skillsDir, 'coding-style.md'), '# Coding Style\nUse TypeScript strict mode.');

    const adapter = new ClaudeCodeAdapter();
    const skills = await adapter.scanClaudeDir(testDir);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('coding-style');
    expect(skills[0].content).toContain('TypeScript strict mode');
  });

  it('should convert Claude Code skill to xclaw manifest', async () => {
    const adapter = new ClaudeCodeAdapter();
    const manifest = adapter.toManifest({
      name: 'coding-style',
      content: '# Coding Style\nUse TypeScript.',
      path: '/project/.claude/skills/coding-style.md',
    });

    expect(manifest.name).toBe('claude-code:coding-style');
    expect(manifest.type).toBe('skill');
    expect(manifest.compatibility?.claudeCode).toBe(true);
  });

  it('should handle empty .claude/skills directory', async () => {
    const claudeDir = join(testDir, '.claude', 'skills');
    await mkdir(claudeDir, { recursive: true });

    const adapter = new ClaudeCodeAdapter();
    const skills = await adapter.scanClaudeDir(testDir);
    expect(skills).toHaveLength(0);
  });

  it('should handle missing .claude directory', async () => {
    const adapter = new ClaudeCodeAdapter();
    const skills = await adapter.scanClaudeDir(testDir);
    expect(skills).toHaveLength(0);
  });

  it('should export xclaw skill to Claude Code format', () => {
    const adapter = new ClaudeCodeAdapter();
    const exported = adapter.exportToClaudeCode({
      name: 'my-skill',
      description: 'A custom skill',
      body: 'You are a helpful assistant that follows the coding standards.',
    });

    expect(exported).toContain('my-skill');
    expect(exported).toContain('coding standards');
  });
});
