import type { PluginManifest } from '../types/plugin.js';
import type { ScanResult } from './scanner.js';

/** Known npm packages that imply specific permission needs. */
const NETWORK_PACKAGES = new Set([
  'node-fetch', 'axios', 'got', 'undici', 'request', 'superagent',
  'puppeteer', 'playwright', 'cheerio', 'jsdom',
]);
const FILESYSTEM_PACKAGES = new Set([
  'fs-extra', 'glob', 'rimraf', 'mkdirp', 'chokidar',
]);
const SYSTEM_PACKAGES = new Set([
  'execa', 'shelljs', 'child_process',
]);

export interface WrappedLifecycle {
  onLoad: () => Promise<void>;
  onUnload: () => Promise<void>;
}

export class OpenClawAdapter {
  /**
   * Convert an OpenClaw scan result into an xclaw PluginManifest.
   */
  toManifest(scan: ScanResult): PluginManifest {
    const pkg = scan.packageJson ?? {};
    const skillMeta = scan.skillMd ? this.parseSkillMdFrontmatter(scan.skillMd) : {};

    const name = (pkg.name as string) ?? skillMeta.name ?? scan.name;
    const version = (pkg.version as string) ?? skillMeta.version ?? '0.0.0';
    const description = (pkg.description as string) ?? skillMeta.description ?? '';

    const permissions = this.inferPermissions(pkg);

    return {
      name,
      version,
      description,
      type: 'skill',
      compatibility: {
        openclaw: version,
      },
      permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
    };
  }

  /**
   * Wrap an OpenClaw plugin's activate/deactivate into xclaw onLoad/onUnload.
   */
  wrapLifecycle(plugin: Record<string, unknown>): WrappedLifecycle {
    return {
      onLoad: async () => {
        if (typeof plugin.activate === 'function') {
          await (plugin.activate as () => Promise<void>)();
        }
      },
      onUnload: async () => {
        if (typeof plugin.deactivate === 'function') {
          await (plugin.deactivate as () => Promise<void>)();
        }
      },
    };
  }

  /**
   * Infer permissions from package.json dependencies.
   */
  private inferPermissions(pkg: Record<string, unknown>): NonNullable<PluginManifest['permissions']> {
    const deps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
    };
    const depNames = Object.keys(deps ?? {});

    const permissions: NonNullable<PluginManifest['permissions']> = {};

    if (depNames.some((d) => NETWORK_PACKAGES.has(d))) {
      permissions.network = ['*'];
    }
    if (depNames.some((d) => FILESYSTEM_PACKAGES.has(d))) {
      permissions.filesystem = ['*'];
    }
    if (depNames.some((d) => SYSTEM_PACKAGES.has(d))) {
      permissions.system = ['*'];
    }

    return permissions;
  }

  private parseSkillMdFrontmatter(content: string): Record<string, string> {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    const lines = match[1].split('\n');
    const result: Record<string, string> = {};
    for (const line of lines) {
      const kv = line.match(/^(\w+):\s*(.+)$/);
      if (kv) {
        result[kv[1]] = kv[2].trim();
      }
    }
    return result;
  }
}
