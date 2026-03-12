import { describe, it, expect } from 'vitest';
import type { PluginManifest, ExtensionProvides } from './plugin.js';

describe('PluginManifest extension type', () => {
  it('accepts extension as a valid type', () => {
    const manifest: PluginManifest = {
      name: 'test-ext',
      version: '1.0.0',
      description: 'test extension',
      type: 'extension',
    };
    expect(manifest.type).toBe('extension');
  });

  it('accepts provides field on extension manifests', () => {
    const provides: ExtensionProvides = {
      channels: ['whatsapp'],
      tools: ['wa_send'],
    };
    const manifest: PluginManifest = {
      name: 'whatsapp-ext',
      version: '1.0.0',
      description: 'WhatsApp extension',
      type: 'extension',
      provides,
    };
    expect(manifest.provides?.channels).toEqual(['whatsapp']);
    expect(manifest.provides?.tools).toEqual(['wa_send']);
  });
});
