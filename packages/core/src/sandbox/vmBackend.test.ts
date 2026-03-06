import { describe, it, expect } from 'vitest';
import { VmIsolateBackend } from './vmBackend.js';

describe('VmIsolateBackend', () => {
  it('should report as available (pure Node.js)', async () => {
    const backend = new VmIsolateBackend();
    expect(await backend.isAvailable()).toBe(true);
  });

  it('should execute a simple command', async () => {
    const backend = new VmIsolateBackend();
    const instance = {
      id: 'sb-test',
      mode: 'ephemeral' as const,
      backend: 'vmIsolate' as const,
      status: 'running' as const,
      createdAt: Date.now(),
      resourceLimits: { memoryMB: 128, timeoutMs: 5000, networkWhitelist: [] },
    };

    await backend.create(instance);
    const result = await backend.execute(instance, 'echo', ['hello']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');
    await backend.destroy(instance);
  });

  it('should respect timeout', async () => {
    const backend = new VmIsolateBackend();
    const instance = {
      id: 'sb-timeout',
      mode: 'ephemeral' as const,
      backend: 'vmIsolate' as const,
      status: 'running' as const,
      createdAt: Date.now(),
      resourceLimits: { memoryMB: 128, timeoutMs: 500, networkWhitelist: [] },
    };

    await backend.create(instance);
    const result = await backend.execute(instance, 'sleep', ['10']);
    expect(result.timedOut).toBe(true);
    await backend.destroy(instance);
  });

  it('should have name = vmIsolate', () => {
    const backend = new VmIsolateBackend();
    expect(backend.name).toBe('vmIsolate');
  });
});
