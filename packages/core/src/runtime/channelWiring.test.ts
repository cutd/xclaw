import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { XClawRuntime } from './runtime.js';

describe('Channel Wiring Edge Cases', () => {
  let runtime: XClawRuntime;
  let tempDir: string;

  beforeEach(async () => {
    runtime = new XClawRuntime();
    tempDir = await mkdtemp(join(tmpdir(), 'xclaw-channel-wiring-test-'));
  });

  afterEach(async () => {
    try { await runtime.stop(); } catch { /* ignore */ }
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('loadChannel() with non-existent channel', () => {
    it('should throw when loading a channel that does not exist', async () => {
      await runtime.start({ skipGateway: true });

      await expect(
        runtime.loadChannel('nonexistent-channel-xyz', { enabled: true }),
      ).rejects.toThrow();
    });

    it('should remain running after a channel load failure', async () => {
      await runtime.start({ skipGateway: true });

      // Attempt to load a bogus channel -- should reject
      try {
        await runtime.loadChannel('does-not-exist', { enabled: true });
      } catch {
        // expected
      }

      // Runtime must still be in the "running" state
      expect(runtime.getStatus().state).toBe('running');
    });

    it('should not add the failed channel to the channel list', async () => {
      await runtime.start({ skipGateway: true });

      try {
        await runtime.loadChannel('missing-channel', { enabled: true });
      } catch {
        // expected
      }

      expect(runtime.getStatus().channels).toEqual([]);
    });
  });

  describe('disabled channels in config', () => {
    it('should skip disabled channels during start()', async () => {
      const yaml = `
version: "0.3.0"
channels:
  - name: "fake-disabled"
    type: "test"
    enabled: false
    config:
      token: "abc"
  - name: "another-disabled"
    type: "test"
    enabled: false
    config:
      token: "def"
`;
      const configPath = join(tempDir, 'xclaw.yaml');
      await writeFile(configPath, yaml, 'utf-8');

      await runtime.loadConfig(configPath);
      await runtime.start({ skipGateway: true });

      // No channels should be loaded because both are disabled
      expect(runtime.getStatus().channels).toEqual([]);
      expect(runtime.getStatus().state).toBe('running');
    });

    it('should skip disabled channels even if they would fail to load', async () => {
      const yaml = `
version: "0.3.0"
channels:
  - name: "totally-nonexistent-package"
    type: "test"
    enabled: false
    config: {}
`;
      const configPath = join(tempDir, 'xclaw.yaml');
      await writeFile(configPath, yaml, 'utf-8');

      await runtime.loadConfig(configPath);

      // start() should succeed because the non-existent channel is disabled
      await runtime.start({ skipGateway: true });

      expect(runtime.getStatus().state).toBe('running');
      expect(runtime.getStatus().channels).toEqual([]);
    });
  });

  describe('getPipeline() accessibility after start', () => {
    it('should return undefined before start()', () => {
      expect(runtime.getPipeline()).toBeUndefined();
    });

    it('should return a defined pipeline after start()', async () => {
      await runtime.start({ skipGateway: true });

      const pipeline = runtime.getPipeline();
      expect(pipeline).toBeDefined();
    });

    it('pipeline should have a process method', async () => {
      await runtime.start({ skipGateway: true });

      const pipeline = runtime.getPipeline();
      expect(pipeline).toBeDefined();
      expect(typeof pipeline!.process).toBe('function');
    });

    it('should return undefined after stop()', async () => {
      await runtime.start({ skipGateway: true });
      expect(runtime.getPipeline()).toBeDefined();

      await runtime.stop();
      expect(runtime.getPipeline()).toBeUndefined();
    });
  });
});
