import { describe, it, expect } from 'vitest';
import { PluginRegistry } from './registry.js';
import type { PluginManifest } from '../types/plugin.js';

describe('PluginRegistry', () => {
  const manifest: PluginManifest = {
    name: 'test-plugin',
    version: '1.0.0',
    description: 'A test plugin',
    type: 'skill',
  };

  it('should register and retrieve a plugin', () => {
    const registry = new PluginRegistry();
    registry.register(manifest, { execute: () => {} });
    expect(registry.get('test-plugin')).toBeDefined();
    expect(registry.get('test-plugin')!.manifest.name).toBe('test-plugin');
  });

  it('should list plugins by type', () => {
    const registry = new PluginRegistry();
    registry.register(manifest, { execute: () => {} });
    registry.register({ ...manifest, name: 'channel-x', type: 'channel' }, { send: () => {} });
    expect(registry.listByType('skill')).toHaveLength(1);
    expect(registry.listByType('channel')).toHaveLength(1);
  });

  it('should unregister a plugin', () => {
    const registry = new PluginRegistry();
    registry.register(manifest, { execute: () => {} });
    registry.unregister('test-plugin');
    expect(registry.get('test-plugin')).toBeUndefined();
  });

  it('should detect duplicate registration', () => {
    const registry = new PluginRegistry();
    registry.register(manifest, { execute: () => {} });
    expect(() => registry.register(manifest, { execute: () => {} })).toThrow();
  });
});
