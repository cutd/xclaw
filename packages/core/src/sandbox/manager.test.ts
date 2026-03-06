import { describe, it, expect, vi } from 'vitest';
import { SandboxManager } from './manager.js';
import type { SandboxBackendDriver, SandboxExecutionResult } from './types.js';

function mockBackend(): SandboxBackendDriver {
  return {
    name: 'vmIsolate',
    isAvailable: vi.fn().mockResolvedValue(true),
    create: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue({
      exitCode: 0, stdout: 'ok', stderr: '', durationMs: 10,
    } satisfies SandboxExecutionResult),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
}

describe('SandboxManager', () => {
  it('should create an ephemeral sandbox', async () => {
    const backend = mockBackend();
    const mgr = new SandboxManager({ backends: [backend], defaultMode: 'ephemeral' });

    const instance = await mgr.create({ mode: 'ephemeral' });
    expect(instance.mode).toBe('ephemeral');
    expect(instance.status).toBe('running');
    expect(backend.create).toHaveBeenCalled();
  });

  it('should create a passthrough sandbox without calling backend', async () => {
    const backend = mockBackend();
    const mgr = new SandboxManager({ backends: [backend], defaultMode: 'ephemeral' });

    const instance = await mgr.create({ mode: 'passthrough' });
    expect(instance.mode).toBe('passthrough');
    expect(instance.backend).toBe('none');
    expect(backend.create).not.toHaveBeenCalled();
  });

  it('should execute a command in a sandbox', async () => {
    const backend = mockBackend();
    const mgr = new SandboxManager({ backends: [backend], defaultMode: 'ephemeral' });

    const instance = await mgr.create({ mode: 'ephemeral' });
    const result = await mgr.execute(instance.id, 'echo', ['hello']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('ok');
  });

  it('should execute passthrough commands via child_process', async () => {
    const backend = mockBackend();
    const mgr = new SandboxManager({ backends: [backend], defaultMode: 'ephemeral' });

    const instance = await mgr.create({ mode: 'passthrough' });
    const result = await mgr.execute(instance.id, 'echo', ['hello']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
  });

  it('should destroy a sandbox', async () => {
    const backend = mockBackend();
    const mgr = new SandboxManager({ backends: [backend], defaultMode: 'ephemeral' });

    const instance = await mgr.create({ mode: 'ephemeral' });
    await mgr.destroy(instance.id);
    expect(backend.destroy).toHaveBeenCalled();
    expect(mgr.get(instance.id)).toBeUndefined();
  });

  it('should list active sandboxes', async () => {
    const backend = mockBackend();
    const mgr = new SandboxManager({ backends: [backend], defaultMode: 'ephemeral' });

    await mgr.create({ mode: 'ephemeral' });
    await mgr.create({ mode: 'persistent', name: 'dev' });
    expect(mgr.listAll()).toHaveLength(2);
  });
});
