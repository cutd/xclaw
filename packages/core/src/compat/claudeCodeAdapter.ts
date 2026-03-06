import { readdir, readFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import type { PluginManifest } from '../types/plugin.js';

export interface ClaudeCodeSkill {
  name: string;
  content: string;
  path: string;
}

export interface ExportInput {
  name: string;
  description: string;
  body: string;
}

export class ClaudeCodeAdapter {
  /**
   * Scan a project directory for .claude/skills/ markdown files.
   */
  async scanClaudeDir(projectDir: string): Promise<ClaudeCodeSkill[]> {
    const skillsDir = join(projectDir, '.claude', 'skills');
    const skills: ClaudeCodeSkill[] = [];

    let entries: string[];
    try {
      entries = await readdir(skillsDir);
    } catch {
      return skills;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;

      const filePath = join(skillsDir, entry);
      try {
        const content = await readFile(filePath, 'utf-8');
        const name = basename(entry, extname(entry));
        skills.push({ name, content, path: filePath });
      } catch {
        // Skip unreadable files
      }
    }

    return skills;
  }

  /**
   * Convert a Claude Code skill to an xclaw PluginManifest.
   */
  toManifest(skill: ClaudeCodeSkill): PluginManifest {
    return {
      name: `claude-code:${skill.name}`,
      version: '0.0.0',
      description: `Claude Code skill: ${skill.name}`,
      type: 'skill',
      compatibility: {
        claudeCode: true,
      },
    };
  }

  /**
   * Export an xclaw skill to Claude Code format (a markdown file).
   */
  exportToClaudeCode(input: ExportInput): string {
    return `# ${input.name}\n\n> ${input.description}\n\n${input.body}\n`;
  }
}
