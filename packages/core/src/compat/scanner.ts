import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { detectPluginFormat, type PluginFormat } from '../plugin/loader.js';

export interface ScanResult {
  name: string;
  path: string;
  format: PluginFormat;
  packageJson?: Record<string, unknown>;
  skillMd?: string;
}

export class PluginScanner {
  /**
   * Scan a directory for plugin subdirectories.
   * Each subdirectory is checked for package.json or SKILL.md.
   */
  async scan(dir: string): Promise<ScanResult[]> {
    const results: ScanResult[] = [];

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return results;
    }

    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const entryStat = await stat(entryPath).catch(() => null);
      if (!entryStat?.isDirectory()) continue;

      const result = await this.detectPlugin(entryPath, entry);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Scan multiple directories and merge results.
   */
  async scanAll(dirs: string[]): Promise<ScanResult[]> {
    const all: ScanResult[] = [];
    for (const dir of dirs) {
      const results = await this.scan(dir);
      all.push(...results);
    }
    return all;
  }

  private async detectPlugin(dir: string, fallbackName: string): Promise<ScanResult | null> {
    // Try package.json first
    const pkgPath = join(dir, 'package.json');
    try {
      const raw = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      const format = detectPluginFormat(pkg);
      if (format !== 'unknown') {
        return {
          name: (pkg.name as string) ?? fallbackName,
          path: dir,
          format,
          packageJson: pkg,
        };
      }
    } catch {
      // No package.json or invalid JSON — continue
    }

    // Try SKILL.md
    const skillMdPath = join(dir, 'SKILL.md');
    try {
      const content = await readFile(skillMdPath, 'utf-8');
      const name = this.extractNameFromSkillMd(content) ?? fallbackName;
      return {
        name,
        path: dir,
        format: 'openclaw',
        skillMd: content,
      };
    } catch {
      // No SKILL.md — not a recognized plugin
    }

    return null;
  }

  private extractNameFromSkillMd(content: string): string | null {
    // Parse YAML frontmatter: lines between --- and ---
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;
    const frontmatter = match[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    return nameMatch ? nameMatch[1].trim() : null;
  }
}
