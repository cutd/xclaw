export type SandboxBackend = 'bwrap' | 'macSandbox' | 'vmIsolate' | 'none';
export type SandboxStatus = 'created' | 'running' | 'paused' | 'stopped' | 'destroyed';

export interface ResourceLimits {
  memoryMB: number;
  timeoutMs: number;
  networkWhitelist: string[];
  cpuShares?: number;
  diskMB?: number;
}

export interface SandboxInstance {
  id: string;
  name?: string;
  mode: 'ephemeral' | 'persistent' | 'passthrough';
  backend: SandboxBackend;
  status: SandboxStatus;
  createdAt: number;
  workDir?: string;
  resourceLimits: ResourceLimits;
}

export interface SandboxExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut?: boolean;
}

export interface SandboxBackendDriver {
  readonly name: SandboxBackend;
  isAvailable(): Promise<boolean>;
  create(instance: SandboxInstance): Promise<void>;
  execute(instance: SandboxInstance, command: string, args?: string[]): Promise<SandboxExecutionResult>;
  destroy(instance: SandboxInstance): Promise<void>;
  snapshot?(instance: SandboxInstance, name: string): Promise<string>;
  restore?(instance: SandboxInstance, snapshotId: string): Promise<void>;
}
