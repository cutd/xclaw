// test/integration/runtime-boot.test.ts
import { describe, it, expect } from 'vitest';
import { XClawRuntime, ConfigLoader } from '@xclaw/core';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Runtime Boot Integration', () => {
  it('should boot full runtime from config file', async () => {
    const testDir = await mkdtemp(join(tmpdir(), 'xclaw-boot-'));
    const yaml = `
gateway:
  host: 127.0.0.1
  port: 0
  heartbeatIntervalMs: 30000
  heartbeatTimeoutMs: 60000
providers: []
channels: []
security:
  promptLevel: warning
  trustedSkills: []
  approvalRules: []
router:
  defaultProvider: anthropic
  defaultModel: claude-sonnet-4-5
  tierModels:
    trivial: claude-haiku-3-5
  contextWindow: 32000
  summarizeAfterTurns: 20
sandbox:
  defaultMode: passthrough
  backend: auto
  memoryLimitMB: 512
  timeoutSeconds: 30
  networkWhitelist: []
  persistDir: ${testDir}/sandboxes
budget:
  monthlyTokenLimit: 1000000
  warningThreshold: 0.8
  perChannelLimits: {}
agent:
  maxConcurrentAgents: 5
  defaultTimeout: 60000
  tierLevels:
    trivial: lightweight
memory:
  enabled: false
  storagePath: ${testDir}/memory
  vectorBackend: none
  hybridWeights:
    vector: 0.7
    bm25: 0.3
  decayHalfLifeDays: 30
  maxRetrievedMemories: 5
  autoExtract: false
`;
    const configPath = join(testDir, 'config.yaml');
    await writeFile(configPath, yaml, 'utf-8');

    const runtime = new XClawRuntime();
    await runtime.loadConfig(configPath);
    await runtime.start({ skipGateway: true });

    // Allow at least 1 ms to elapse so uptime is > 0
    await new Promise((r) => setTimeout(r, 5));

    const status = runtime.getStatus();
    expect(status.state).toBe('running');
    expect(status.uptime).toBeGreaterThan(0);
    expect(runtime.getPipeline()).toBeDefined();

    await runtime.stop();
    expect(runtime.getStatus().state).toBe('stopped');

    await rm(testDir, { recursive: true, force: true });
  });

  it('should load ConfigLoader defaults gracefully', async () => {
    const loader = new ConfigLoader();
    const config = await loader.load('/nonexistent/path.yaml');
    expect(config.gateway.host).toBe('127.0.0.1');
    expect(config.gateway.port).toBe(18789);
    expect(config.providers).toEqual([]);
  });

  it('should boot with gateway and clean stop', async () => {
    const testDir = await mkdtemp(join(tmpdir(), 'xclaw-gw-boot-'));
    const yaml = `
gateway:
  host: 127.0.0.1
  port: 0
  heartbeatIntervalMs: 30000
  heartbeatTimeoutMs: 60000
providers: []
channels: []
security:
  promptLevel: warning
  trustedSkills: []
  approvalRules: []
router:
  defaultProvider: anthropic
  defaultModel: claude-sonnet-4-5
  tierModels: {}
  contextWindow: 32000
  summarizeAfterTurns: 20
sandbox:
  defaultMode: passthrough
  backend: auto
  memoryLimitMB: 512
  timeoutSeconds: 30
  networkWhitelist: []
  persistDir: ${testDir}/sandboxes
budget:
  monthlyTokenLimit: 1000000
  warningThreshold: 0.8
  perChannelLimits: {}
agent:
  maxConcurrentAgents: 5
  defaultTimeout: 60000
  tierLevels: {}
memory:
  enabled: false
  storagePath: ${testDir}/memory
  vectorBackend: none
  hybridWeights:
    vector: 0.7
    bm25: 0.3
  decayHalfLifeDays: 30
  maxRetrievedMemories: 5
  autoExtract: false
`;
    const configPath = join(testDir, 'config.yaml');
    await writeFile(configPath, yaml, 'utf-8');

    const runtime = new XClawRuntime();
    await runtime.loadConfig(configPath);
    await runtime.start(); // WITH gateway

    expect(runtime.getGateway()).toBeDefined();
    expect(runtime.getStatus().state).toBe('running');

    await runtime.stop();
    expect(runtime.getGateway()).toBeUndefined();

    await rm(testDir, { recursive: true, force: true });
  });
});
