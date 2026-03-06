import { describe, it, expect, vi } from 'vitest';
import { OpenClawAdapter } from './openclawAdapter.js';
import type { ScanResult } from './scanner.js';

describe('OpenClawAdapter', () => {
  it('should convert OpenClaw scan result to xclaw PluginManifest', () => {
    const scan: ScanResult = {
      name: 'github-helper',
      path: '/home/user/.openclaw/skills/github-helper',
      format: 'openclaw',
      packageJson: {
        name: 'github-helper',
        version: '2.1.0',
        description: 'GitHub PR management',
        keywords: ['openclaw-skill'],
      },
    };

    const adapter = new OpenClawAdapter();
    const manifest = adapter.toManifest(scan);

    expect(manifest.name).toBe('github-helper');
    expect(manifest.version).toBe('2.1.0');
    expect(manifest.description).toBe('GitHub PR management');
    expect(manifest.type).toBe('skill');
    expect(manifest.compatibility?.openclaw).toBeDefined();
  });

  it('should convert SKILL.md based plugin to manifest', () => {
    const scan: ScanResult = {
      name: 'notes',
      path: '/home/user/.openclaw/skills/notes',
      format: 'openclaw',
      skillMd: '---\nname: notes\nversion: 1.0.0\ndescription: Note taking skill\ntags: [productivity]\n---\nYou can take notes.',
    };

    const adapter = new OpenClawAdapter();
    const manifest = adapter.toManifest(scan);

    expect(manifest.name).toBe('notes');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.description).toBe('Note taking skill');
  });

  it('should map OpenClaw lifecycle methods', () => {
    const mockPlugin = {
      activate: vi.fn().mockResolvedValue(undefined),
      deactivate: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = new OpenClawAdapter();
    const wrapped = adapter.wrapLifecycle(mockPlugin);

    expect(typeof wrapped.onLoad).toBe('function');
    expect(typeof wrapped.onUnload).toBe('function');
  });

  it('should call activate on onLoad and deactivate on onUnload', async () => {
    const mockPlugin = {
      activate: vi.fn().mockResolvedValue(undefined),
      deactivate: vi.fn().mockResolvedValue(undefined),
    };

    const adapter = new OpenClawAdapter();
    const wrapped = adapter.wrapLifecycle(mockPlugin);

    await wrapped.onLoad();
    expect(mockPlugin.activate).toHaveBeenCalledOnce();

    await wrapped.onUnload();
    expect(mockPlugin.deactivate).toHaveBeenCalledOnce();
  });

  it('should infer permissions from package.json dependencies', () => {
    const scan: ScanResult = {
      name: 'web-scraper',
      path: '/tmp/web-scraper',
      format: 'openclaw',
      packageJson: {
        name: 'web-scraper',
        version: '1.0.0',
        keywords: ['openclaw-skill'],
        dependencies: {
          'node-fetch': '^3.0.0',
          'cheerio': '^1.0.0',
          'fs-extra': '^11.0.0',
        },
      },
    };

    const adapter = new OpenClawAdapter();
    const manifest = adapter.toManifest(scan);

    expect(manifest.permissions?.network).toBeDefined();
    expect(manifest.permissions?.filesystem).toBeDefined();
  });

  it('should handle missing fields gracefully', () => {
    const scan: ScanResult = {
      name: 'minimal',
      path: '/tmp/minimal',
      format: 'openclaw',
    };

    const adapter = new OpenClawAdapter();
    const manifest = adapter.toManifest(scan);

    expect(manifest.name).toBe('minimal');
    expect(manifest.version).toBe('0.0.0');
    expect(manifest.description).toBe('');
  });
});
