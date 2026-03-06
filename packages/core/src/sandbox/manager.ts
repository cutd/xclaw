import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import type {
  SandboxInstance,
  SandboxBackendDriver,
  SandboxExecutionResult,
  ResourceLimits,
} from './types.js';

type SandboxMode = 'ephemeral' | 'persistent' | 'passthrough';

export interface SandboxManagerConfig {
  backends: SandboxBackendDriver[];
  defaultMode: SandboxMode;
  defaultLimits?: Partial<ResourceLimits>;
}

export interface CreateSandboxOptions {
  mode?: SandboxMode;
  name?: string;
  limits?: Partial<ResourceLimits>;
}

export class SandboxManager {
  private instances = new Map<string, SandboxInstance>();
  private readonly config: SandboxManagerConfig;
  private readonly defaultLimits: ResourceLimits;

  constructor(config: SandboxManagerConfig) {
    this.config = config;
    this.defaultLimits = {
      memoryMB: config.defaultLimits?.memoryMB ?? 512,
      timeoutMs: config.defaultLimits?.timeoutMs ?? 30000,
      networkWhitelist: config.defaultLimits?.networkWhitelist ?? [],
    };
  }

  async create(options: CreateSandboxOptions = {}): Promise<SandboxInstance> {
    const mode = options.mode ?? this.config.defaultMode;
    const id = `sb-${randomUUID().slice(0, 8)}`;
    const limits: ResourceLimits = { ...this.defaultLimits, ...options.limits };

    if (mode === 'passthrough') {
      const instance: SandboxInstance = {
        id,
        name: options.name,
        mode: 'passthrough',
        backend: 'none',
        status: 'running',
        createdAt: Date.now(),
        resourceLimits: { memoryMB: 0, timeoutMs: 0, networkWhitelist: [] },
      };
      this.instances.set(id, instance);
      return instance;
    }

    const backend = await this.selectBackend();
    const instance: SandboxInstance = {
      id,
      name: options.name,
      mode,
      backend: backend.name,
      status: 'running',
      createdAt: Date.now(),
      workDir: mode === 'persistent' ? `~/.xclaw/sandboxes/${options.name ?? id}` : undefined,
      resourceLimits: limits,
    };

    await backend.create(instance);
    this.instances.set(id, instance);
    return instance;
  }

  async execute(id: string, command: string, args?: string[]): Promise<SandboxExecutionResult> {
    const instance = this.instances.get(id);
    if (!instance) throw new Error(`Sandbox "${id}" not found`);

    if (instance.mode === 'passthrough') {
      return this.executePassthrough(command, args ?? []);
    }

    const backend = this.getBackendDriver(instance.backend);
    return backend.execute(instance, command, args);
  }

  async destroy(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) return;

    if (instance.mode !== 'passthrough') {
      const backend = this.getBackendDriver(instance.backend);
      await backend.destroy(instance);
    }

    instance.status = 'destroyed';
    this.instances.delete(id);
  }

  get(id: string): SandboxInstance | undefined {
    return this.instances.get(id);
  }

  listAll(): SandboxInstance[] {
    return [...this.instances.values()];
  }

  private async selectBackend(): Promise<SandboxBackendDriver> {
    for (const backend of this.config.backends) {
      if (await backend.isAvailable()) return backend;
    }
    throw new Error('No sandbox backend available');
  }

  private getBackendDriver(name: string): SandboxBackendDriver {
    const backend = this.config.backends.find((b) => b.name === name);
    if (!backend) throw new Error(`Sandbox backend "${name}" not found`);
    return backend;
  }

  private executePassthrough(command: string, args: string[]): Promise<SandboxExecutionResult> {
    const start = Date.now();
    return new Promise((resolve) => {
      execFile(command, args, { timeout: 30000 }, (error, stdout, stderr) => {
        resolve({
          exitCode: error ? 1 : 0,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          durationMs: Date.now() - start,
        });
      });
    });
  }
}
