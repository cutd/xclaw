import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configGet, configSet, configList } from './config.js';

describe('config command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'xclaw-config-cmd-'));
    const configPath = join(tmpDir, 'config.yaml');
    await writeFile(configPath, 'version: "0.1.0"\ngateway:\n  port: 18789\n', 'utf-8');
    vi.stubEnv('XCLAW_CONFIG', configPath);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('should get a nested value', async () => {
    const result = await configGet('gateway.port');
    expect(result).toBe('18789');
  });

  it('should set a value', async () => {
    await configSet('gateway.port', '9999');
    const result = await configGet('gateway.port');
    expect(result).toBe('9999');
  });

  it('should list full config', async () => {
    const result = await configList();
    expect(result).toContain('version');
    expect(result).toContain('gateway');
  });

  it('should handle missing key', async () => {
    const result = await configGet('nonexistent.key');
    expect(result).toContain('not found');
  });
});
