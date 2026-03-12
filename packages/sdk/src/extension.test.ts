import { describe, it, expect } from 'vitest';
import { BaseExtensionPlugin } from './extension.js';
import type { PluginManifest } from '@xclaw/core';

class TestExtension extends BaseExtensionPlugin {
  manifest: PluginManifest = {
    name: 'test-ext',
    version: '1.0.0',
    description: 'A test extension',
    type: 'extension',
    provides: { channels: ['test-channel'] },
  };

  loaded = false;

  async onLoad(): Promise<void> {
    this.loaded = true;
  }

  async onUnload(): Promise<void> {
    this.loaded = false;
  }
}

describe('BaseExtensionPlugin', () => {
  it('can be subclassed and loaded/unloaded', async () => {
    const ext = new TestExtension();
    expect(ext.manifest.type).toBe('extension');
    expect(ext.manifest.provides?.channels).toEqual(['test-channel']);
    await ext.onLoad();
    expect(ext.loaded).toBe(true);
    await ext.onUnload();
    expect(ext.loaded).toBe(false);
  });

  it('exposes providesChannels() helper', () => {
    const ext = new TestExtension();
    expect(ext.providesChannels()).toEqual(['test-channel']);
  });

  it('returns empty arrays for unprovided capabilities', () => {
    const ext = new TestExtension();
    expect(ext.providesTools()).toEqual([]);
    expect(ext.providesDevice()).toEqual([]);
  });
});
