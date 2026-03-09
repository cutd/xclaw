import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigLoader, DEFAULT_CONFIG } from './configLoader.js';

describe('ConfigLoader', () => {
  let loader: ConfigLoader;
  let tempDir: string;

  beforeEach(async () => {
    loader = new ConfigLoader();
    tempDir = await mkdtemp(join(tmpdir(), 'xclaw-config-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('load() — valid YAML', () => {
    it('should parse a YAML config and return typed values', async () => {
      const yaml = `
version: "1.0.0"
gateway:
  host: "0.0.0.0"
  port: 9999
  heartbeatIntervalMs: 15000
  heartbeatTimeoutMs: 45000
router:
  defaultProvider: openai
  defaultModel: gpt-4o
  tierModels: {}
  contextWindow: 64000
  summarizeAfterTurns: 10
`;
      const configPath = join(tempDir, 'xclaw.yaml');
      await writeFile(configPath, yaml, 'utf-8');

      const config = await loader.load(configPath);

      expect(config.version).toBe('1.0.0');
      expect(config.gateway.host).toBe('0.0.0.0');
      expect(config.gateway.port).toBe(9999);
      expect(config.gateway.heartbeatIntervalMs).toBe(15000);
      expect(config.gateway.heartbeatTimeoutMs).toBe(45000);
      expect(config.router.defaultProvider).toBe('openai');
      expect(config.router.defaultModel).toBe('gpt-4o');
      expect(config.router.contextWindow).toBe(64000);
      expect(config.router.summarizeAfterTurns).toBe(10);
    });

    it('should merge file values with defaults (partial config)', async () => {
      const yaml = `
version: "0.2.0"
`;
      const configPath = join(tempDir, 'partial.yaml');
      await writeFile(configPath, yaml, 'utf-8');

      const config = await loader.load(configPath);

      // Overridden value
      expect(config.version).toBe('0.2.0');
      // Defaults preserved for fields not in file
      expect(config.gateway.port).toBe(18789);
      expect(config.sandbox.defaultMode).toBe('passthrough');
      expect(config.budget.monthlyTokenLimit).toBe(1_000_000);
      expect(config.agent.maxConcurrentAgents).toBe(5);
      expect(config.memory.enabled).toBe(false);
    });
  });

  describe('load() — env var resolution', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    afterEach(() => {
      process.env = ORIGINAL_ENV;
    });

    it('should resolve ${ENV_VAR} placeholders from process.env', async () => {
      process.env.XCLAW_HOST = '10.0.0.1';
      process.env.XCLAW_PORT = '7777';

      const yaml = `
version: "0.1.0"
gateway:
  host: "\${XCLAW_HOST}"
  port: \${XCLAW_PORT}
  heartbeatIntervalMs: 30000
  heartbeatTimeoutMs: 60000
`;
      const configPath = join(tempDir, 'env.yaml');
      await writeFile(configPath, yaml, 'utf-8');

      const config = await loader.load(configPath);

      expect(config.gateway.host).toBe('10.0.0.1');
      expect(config.gateway.port).toBe(7777);
    });

    it('should replace undefined env vars with empty string', async () => {
      delete process.env.NONEXISTENT_VAR;

      const yaml = `
version: "\${NONEXISTENT_VAR}"
`;
      const configPath = join(tempDir, 'missing-env.yaml');
      await writeFile(configPath, yaml, 'utf-8');

      const config = await loader.load(configPath);

      expect(config.version).toBe('');
    });

    it('should resolve multiple env vars in the same file', async () => {
      process.env.MY_PROVIDER = 'google';
      process.env.MY_MODEL = 'gemini-pro';

      const yaml = `
router:
  defaultProvider: "\${MY_PROVIDER}"
  defaultModel: "\${MY_MODEL}"
  tierModels: {}
  contextWindow: 32000
  summarizeAfterTurns: 20
`;
      const configPath = join(tempDir, 'multi-env.yaml');
      await writeFile(configPath, yaml, 'utf-8');

      const config = await loader.load(configPath);

      expect(config.router.defaultProvider).toBe('google');
      expect(config.router.defaultModel).toBe('gemini-pro');
    });
  });

  describe('load() — missing file (defaults)', () => {
    it('should return sensible defaults when the config file does not exist', async () => {
      const config = await loader.load('/nonexistent/path/xclaw.yaml');

      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('default config should have expected gateway values', async () => {
      const config = await loader.load('/does/not/exist.yaml');

      expect(config.version).toBe('0.1.0');
      expect(config.gateway.host).toBe('127.0.0.1');
      expect(config.gateway.port).toBe(18789);
      expect(config.gateway.heartbeatIntervalMs).toBe(30000);
      expect(config.gateway.heartbeatTimeoutMs).toBe(60000);
    });

    it('default config should have empty providers and channels', async () => {
      const config = await loader.load('/does/not/exist.yaml');

      expect(config.providers).toEqual([]);
      expect(config.channels).toEqual([]);
    });

    it('default config should have expected security settings', async () => {
      const config = await loader.load('/does/not/exist.yaml');

      expect(config.security.promptLevel).toBe('warning');
      expect(config.security.trustedSkills).toEqual([]);
      expect(config.security.approvalRules).toEqual([]);
    });

    it('default config should have expected router settings', async () => {
      const config = await loader.load('/does/not/exist.yaml');

      expect(config.router.defaultProvider).toBe('anthropic');
      expect(config.router.defaultModel).toBe('claude-sonnet-4-5');
      expect(config.router.contextWindow).toBe(32000);
      expect(config.router.summarizeAfterTurns).toBe(20);
    });

    it('default config should have expected sandbox settings', async () => {
      const config = await loader.load('/does/not/exist.yaml');

      expect(config.sandbox.defaultMode).toBe('passthrough');
      expect(config.sandbox.backend).toBe('auto');
      expect(config.sandbox.memoryLimitMB).toBe(512);
      expect(config.sandbox.timeoutSeconds).toBe(30);
      expect(config.sandbox.persistDir).toBe('~/.xclaw/sandboxes');
    });

    it('default config should have expected memory settings', async () => {
      const config = await loader.load('/does/not/exist.yaml');

      expect(config.memory.enabled).toBe(false);
      expect(config.memory.storagePath).toBe('~/.xclaw/memory');
      expect(config.memory.vectorBackend).toBe('none');
      expect(config.memory.hybridWeights).toEqual({ vector: 0.7, bm25: 0.3 });
    });
  });
});
