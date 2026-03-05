import type { PluginManifest } from '../types/plugin.js';
import { XClawError } from '../types/error.js';

export interface RegisteredPlugin {
  manifest: PluginManifest;
  instance: unknown;
  status: 'registered' | 'loaded' | 'active' | 'error';
}

export class PluginRegistry {
  private plugins = new Map<string, RegisteredPlugin>();

  register(manifest: PluginManifest, instance: unknown): void {
    if (this.plugins.has(manifest.name)) {
      throw new XClawError({
        code: 'PLUGIN.DUPLICATE',
        message: `Plugin "${manifest.name}" is already registered`,
        severity: 'error',
        suggestion: `Unregister the existing plugin first or use a different name`,
      });
    }
    this.plugins.set(manifest.name, { manifest, instance, status: 'registered' });
  }

  get(name: string): RegisteredPlugin | undefined {
    return this.plugins.get(name);
  }

  unregister(name: string): boolean {
    return this.plugins.delete(name);
  }

  listByType(type: PluginManifest['type']): RegisteredPlugin[] {
    return [...this.plugins.values()].filter((p) => p.manifest.type === type);
  }

  listAll(): RegisteredPlugin[] {
    return [...this.plugins.values()];
  }
}
