import type { RegisteredPlugin } from './registry.js';

export class PluginLifecycle {
  async activate(plugin: RegisteredPlugin): Promise<void> {
    if (typeof (plugin.instance as Record<string, unknown>).onLoad === 'function') {
      await (plugin.instance as { onLoad: () => Promise<void> }).onLoad();
    }
    plugin.status = 'active';
  }

  async deactivate(plugin: RegisteredPlugin): Promise<void> {
    if (typeof (plugin.instance as Record<string, unknown>).onUnload === 'function') {
      await (plugin.instance as { onUnload: () => Promise<void> }).onUnload();
    }
    plugin.status = 'registered';
  }
}
