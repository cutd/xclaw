import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { XClawConfig } from '../types/config.js';

const DEFAULT_CONFIG: XClawConfig = {
  version: '0.1.0',
  gateway: {
    host: '127.0.0.1',
    port: 18789,
    heartbeatIntervalMs: 30000,
    heartbeatTimeoutMs: 60000,
  },
  providers: [],
  channels: [],
  security: {
    promptLevel: 'warning',
    trustedSkills: [],
    approvalRules: [],
  },
  router: {
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-5',
    tierModels: {},
    contextWindow: 32000,
    summarizeAfterTurns: 20,
  },
  sandbox: {
    defaultMode: 'passthrough',
    backend: 'auto',
    memoryLimitMB: 512,
    timeoutSeconds: 30,
    networkWhitelist: [],
    persistDir: '~/.xclaw/sandboxes',
  },
  budget: {
    monthlyTokenLimit: 1_000_000,
    warningThreshold: 0.8,
    perChannelLimits: {},
  },
  agent: {
    maxConcurrentAgents: 5,
    defaultTimeout: 60000,
    tierLevels: {},
  },
  memory: {
    enabled: false,
    storagePath: '~/.xclaw/memory',
    vectorBackend: 'none',
    hybridWeights: { vector: 0.7, bm25: 0.3 },
    decayHalfLifeDays: 30,
    maxRetrievedMemories: 5,
    autoExtract: false,
  },
};

export { DEFAULT_CONFIG };

export class ConfigLoader {
  async load(path: string): Promise<XClawConfig> {
    let raw: string;
    try {
      raw = await readFile(path, 'utf-8');
    } catch {
      return { ...DEFAULT_CONFIG };
    }

    const resolved = this.resolveEnvVars(raw);
    const parsed = parseYaml(resolved) as Partial<XClawConfig>;
    return { ...DEFAULT_CONFIG, ...parsed } as XClawConfig;
  }

  private resolveEnvVars(content: string): string {
    return content.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)}/g,
      (_, varName) => {
        return process.env[varName] ?? '';
      },
    );
  }
}
