import { watch, type FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { XClawConfig } from '../types/config.js';

export class ConfigWatcher {
  private watcher?: FSWatcher;
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly configPath: string,
    private readonly onChange: (newConfig: XClawConfig) => void,
    private readonly debounceMs = 500,
  ) {}

  start(): void {
    this.watcher = watch(this.configPath, {}, () => {
      this.scheduleReload();
    });
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }

  private scheduleReload(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.reload().catch(() => {});
    }, this.debounceMs);
  }

  private async reload(): Promise<void> {
    try {
      const raw = await readFile(this.configPath, 'utf-8');
      const config = parseYaml(raw) as XClawConfig;
      this.onChange(config);
    } catch {
      // Parse or read failed -- keep current config, don't crash
    }
  }
}
