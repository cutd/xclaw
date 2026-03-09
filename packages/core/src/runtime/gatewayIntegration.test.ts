import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { XClawRuntime } from './runtime.js';

describe('Gateway Integration', () => {
  let runtime: XClawRuntime;
  let tempDir: string;

  beforeEach(async () => {
    runtime = new XClawRuntime();
    tempDir = await mkdtemp(join(tmpdir(), 'xclaw-gateway-test-'));
  });

  afterEach(async () => {
    try { await runtime.stop(); } catch { /* ignore */ }
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('starting runtime with gateway enabled', () => {
    it('should create a gateway when skipGateway is not set', async () => {
      // Use port 0 so the OS assigns a random available port
      const yaml = `
version: "0.3.0"
gateway:
  host: "127.0.0.1"
  port: 0
  heartbeatIntervalMs: 30000
  heartbeatTimeoutMs: 60000
`;
      const configPath = join(tempDir, 'xclaw.yaml');
      await writeFile(configPath, yaml, 'utf-8');

      await runtime.loadConfig(configPath);
      await runtime.start(); // no skipGateway

      expect(runtime.getGateway()).toBeDefined();
    });

    it('should not create a gateway when skipGateway is true', async () => {
      await runtime.start({ skipGateway: true });

      expect(runtime.getGateway()).toBeUndefined();
    });
  });

  describe('getGateway() lifecycle', () => {
    it('should return defined when started with gateway', async () => {
      const yaml = `
version: "0.3.0"
gateway:
  host: "127.0.0.1"
  port: 0
  heartbeatIntervalMs: 30000
  heartbeatTimeoutMs: 60000
`;
      const configPath = join(tempDir, 'xclaw.yaml');
      await writeFile(configPath, yaml, 'utf-8');

      await runtime.loadConfig(configPath);
      await runtime.start();

      const gw = runtime.getGateway();
      expect(gw).toBeDefined();
      // Verify it has the expected session manager property
      expect(gw!.sessions).toBeDefined();
    });

    it('should return undefined after stop()', async () => {
      const yaml = `
version: "0.3.0"
gateway:
  host: "127.0.0.1"
  port: 0
  heartbeatIntervalMs: 30000
  heartbeatTimeoutMs: 60000
`;
      const configPath = join(tempDir, 'xclaw.yaml');
      await writeFile(configPath, yaml, 'utf-8');

      await runtime.loadConfig(configPath);
      await runtime.start();

      // Confirm gateway exists before stop
      expect(runtime.getGateway()).toBeDefined();

      await runtime.stop();

      // Gateway should be cleaned up after stop
      expect(runtime.getGateway()).toBeUndefined();
    });

    it('should report running state with gateway active', async () => {
      const yaml = `
version: "0.3.0"
gateway:
  host: "127.0.0.1"
  port: 0
  heartbeatIntervalMs: 30000
  heartbeatTimeoutMs: 60000
`;
      const configPath = join(tempDir, 'xclaw.yaml');
      await writeFile(configPath, yaml, 'utf-8');

      await runtime.loadConfig(configPath);
      await runtime.start();

      expect(runtime.getStatus().state).toBe('running');
    });
  });
});
