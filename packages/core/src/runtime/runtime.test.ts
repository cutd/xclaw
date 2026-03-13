import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { XClawRuntime } from './runtime.js';

describe('XClawRuntime', () => {
  let runtime: XClawRuntime;
  let tempDir: string;

  beforeEach(async () => {
    runtime = new XClawRuntime();
    tempDir = await mkdtemp(join(tmpdir(), 'xclaw-runtime-test-'));
  });

  afterEach(async () => {
    // Ensure runtime is stopped after each test
    try { await runtime.stop(); } catch { /* ignore */ }
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('getStatus() — default state', () => {
    it('should report state as "stopped" with empty channels and zero uptime', () => {
      const status = runtime.getStatus();

      expect(status.state).toBe('stopped');
      expect(status.channels).toEqual([]);
      expect(status.extensions).toEqual([]);
      expect(status.uptime).toBe(0);
    });
  });

  describe('loadConfig()', () => {
    it('should transition state to "configured" after loading a config file', async () => {
      const yaml = `
version: "0.3.0"
gateway:
  host: "127.0.0.1"
  port: 19000
  heartbeatIntervalMs: 30000
  heartbeatTimeoutMs: 60000
`;
      const configPath = join(tempDir, 'xclaw.yaml');
      await writeFile(configPath, yaml, 'utf-8');

      await runtime.loadConfig(configPath);

      expect(runtime.getStatus().state).toBe('configured');
    });

    it('should transition to "configured" even with a missing file (uses defaults)', async () => {
      await runtime.loadConfig('/nonexistent/path/xclaw.yaml');

      expect(runtime.getStatus().state).toBe('configured');
    });
  });

  describe('start() and stop() lifecycle', () => {
    it('should transition to "running" on start with skipGateway', async () => {
      await runtime.start({ skipGateway: true });

      expect(runtime.getStatus().state).toBe('running');
    });

    it('should transition back to "stopped" after stop()', async () => {
      await runtime.start({ skipGateway: true });
      expect(runtime.getStatus().state).toBe('running');

      await runtime.stop();
      expect(runtime.getStatus().state).toBe('stopped');
    });

    it('should use default config when start() is called without loadConfig()', async () => {
      await runtime.start({ skipGateway: true });

      // Should be running with defaults -- no crash
      expect(runtime.getStatus().state).toBe('running');
    });

    it('should initialize the pipeline on start', async () => {
      expect(runtime.getPipeline()).toBeUndefined();

      await runtime.start({ skipGateway: true });

      expect(runtime.getPipeline()).toBeDefined();
    });

    it('should clear the pipeline on stop', async () => {
      await runtime.start({ skipGateway: true });
      expect(runtime.getPipeline()).toBeDefined();

      await runtime.stop();
      expect(runtime.getPipeline()).toBeUndefined();
    });

    it('should not create a gateway when skipGateway is true', async () => {
      await runtime.start({ skipGateway: true });

      expect(runtime.getGateway()).toBeUndefined();
    });
  });

  describe('getStatus() — uptime', () => {
    it('should report uptime > 0 when running', async () => {
      await runtime.start({ skipGateway: true });

      // Wait a small amount to ensure uptime is measurable
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = runtime.getStatus();
      expect(status.uptime).toBeGreaterThan(0);
    });

    it('should report uptime as 0 after stop', async () => {
      await runtime.start({ skipGateway: true });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await runtime.stop();

      const status = runtime.getStatus();
      expect(status.uptime).toBe(0);
    });
  });
});
