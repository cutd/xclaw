import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PluginScanner } from './scanner.js';

describe('PluginScanner', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'xclaw-scan-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should detect xclaw native plugin from package.json', async () => {
    const pluginDir = join(testDir, 'my-skill');
    await mkdir(pluginDir);
    await writeFile(join(pluginDir, 'package.json'), JSON.stringify({
      name: 'my-skill',
      version: '1.0.0',
      keywords: ['xclaw-skill'],
    }));

    const scanner = new PluginScanner();
    const results = await scanner.scan(testDir);
    expect(results).toHaveLength(1);
    expect(results[0].format).toBe('xclaw');
    expect(results[0].name).toBe('my-skill');
  });

  it('should detect openclaw plugin from package.json keywords', async () => {
    const pluginDir = join(testDir, 'oc-ext');
    await mkdir(pluginDir);
    await writeFile(join(pluginDir, 'package.json'), JSON.stringify({
      name: 'oc-ext',
      version: '1.0.0',
      keywords: ['openclaw-skill'],
    }));

    const scanner = new PluginScanner();
    const results = await scanner.scan(testDir);
    expect(results).toHaveLength(1);
    expect(results[0].format).toBe('openclaw');
  });

  it('should detect openclaw skill from SKILL.md file', async () => {
    const pluginDir = join(testDir, 'md-skill');
    await mkdir(pluginDir);
    await writeFile(join(pluginDir, 'SKILL.md'), '---\nname: md-skill\nversion: 1.0.0\n---\nA skill.');

    const scanner = new PluginScanner();
    const results = await scanner.scan(testDir);
    expect(results).toHaveLength(1);
    expect(results[0].format).toBe('openclaw');
    expect(results[0].name).toBe('md-skill');
  });

  it('should skip non-plugin directories', async () => {
    const emptyDir = join(testDir, 'not-a-plugin');
    await mkdir(emptyDir);
    await writeFile(join(emptyDir, 'readme.txt'), 'nothing here');

    const scanner = new PluginScanner();
    const results = await scanner.scan(testDir);
    expect(results).toHaveLength(0);
  });

  it('should scan multiple directories', async () => {
    const dir1 = join(testDir, 'skill-a');
    const dir2 = join(testDir, 'skill-b');
    await mkdir(dir1);
    await mkdir(dir2);
    await writeFile(join(dir1, 'package.json'), JSON.stringify({ name: 'a', keywords: ['xclaw-skill'] }));
    await writeFile(join(dir2, 'SKILL.md'), '---\nname: b\n---\nB.');

    const scanner = new PluginScanner();
    const results = await scanner.scan(testDir);
    expect(results).toHaveLength(2);
  });
});
