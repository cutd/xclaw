import { describe, it, expect } from 'vitest';
import { PluginRegistry } from '../../packages/core/src/plugin/registry.js';
import { detectPluginFormat } from '../../packages/core/src/plugin/loader.js';

describe('Extension integration', () => {
  it('detects and registers mixed plugin formats', () => {
    const registry = new PluginRegistry();

    // xclaw native channel
    registry.register(
      { name: 'telegram', version: '1.0.0', description: 'Telegram', type: 'channel' },
      {},
    );

    // xclaw extension
    registry.register(
      {
        name: 'whatsapp', version: '1.0.0', description: 'WhatsApp',
        type: 'extension', provides: { channels: ['whatsapp'] },
      },
      {},
    );

    // skill
    registry.register(
      { name: 'shell', version: '1.0.0', description: 'Shell', type: 'skill' },
      {},
    );

    expect(registry.listByType('channel')).toHaveLength(1);
    expect(registry.listByType('extension')).toHaveLength(1);
    expect(registry.listByType('skill')).toHaveLength(1);
    expect(registry.listAll()).toHaveLength(3);
  });

  it('detects extension keyword in package.json', () => {
    expect(detectPluginFormat({ keywords: ['xclaw-extension'] })).toBe('xclaw');
  });

  it('detects openclaw-skill keyword', () => {
    expect(detectPluginFormat({ keywords: ['openclaw-skill'] })).toBe('openclaw');
  });

  it('returns unknown for unrecognized format', () => {
    expect(detectPluginFormat({ keywords: ['random-thing'] })).toBe('unknown');
  });
});
