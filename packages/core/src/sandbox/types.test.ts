import { describe, it, expect } from 'vitest';
import type { SandboxInstance, SandboxExecutionResult, ResourceLimits } from './types.js';

describe('Sandbox types', () => {
  it('should accept a sandbox instance', () => {
    const instance: SandboxInstance = {
      id: 'sb-001',
      name: 'test-sandbox',
      mode: 'ephemeral',
      backend: 'vmIsolate',
      status: 'running',
      createdAt: Date.now(),
      workDir: '/tmp/xclaw-sb-001',
      resourceLimits: { memoryMB: 512, timeoutMs: 30000, networkWhitelist: [] },
    };
    expect(instance.mode).toBe('ephemeral');
  });

  it('should accept passthrough mode', () => {
    const instance: SandboxInstance = {
      id: 'sb-002',
      name: 'passthrough-sandbox',
      mode: 'passthrough',
      backend: 'none',
      status: 'running',
      createdAt: Date.now(),
      resourceLimits: { memoryMB: 0, timeoutMs: 0, networkWhitelist: [] },
    };
    expect(instance.backend).toBe('none');
  });

  it('should accept execution result', () => {
    const result: SandboxExecutionResult = {
      exitCode: 0,
      stdout: 'hello',
      stderr: '',
      durationMs: 42,
    };
    expect(result.exitCode).toBe(0);
  });
});
