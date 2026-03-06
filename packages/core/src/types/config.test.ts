import { describe, it, expect } from 'vitest';
import type { XClawConfig, GatewayConfig, AgentConfig, SandboxConfig } from './config.js';

describe('Config types', () => {
  it('should accept a config with gateway settings', () => {
    const config: GatewayConfig = {
      host: '127.0.0.1',
      port: 18789,
      heartbeatIntervalMs: 30000,
      heartbeatTimeoutMs: 10000,
    };
    expect(config.port).toBe(18789);
  });

  it('should accept agent config with tier mapping', () => {
    const config: AgentConfig = {
      maxConcurrentAgents: 5,
      defaultTimeout: 120000,
      tierLevels: {
        trivial: 'lightweight',
        simple: 'lightweight',
        standard: 'standard',
        complex: 'expert',
      },
    };
    expect(config.tierLevels.complex).toBe('expert');
  });

  it('should accept sandbox config with passthrough mode', () => {
    const config: SandboxConfig = {
      defaultMode: 'passthrough',
      backend: 'auto',
      memoryLimitMB: 512,
      timeoutSeconds: 30,
      networkWhitelist: [],
      persistDir: '~/.xclaw/sandboxes',
      perSkillMode: { 'trusted-skill': 'passthrough' },
    };
    expect(config.defaultMode).toBe('passthrough');
    expect(config.perSkillMode?.['trusted-skill']).toBe('passthrough');
  });
});
