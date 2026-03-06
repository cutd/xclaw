import { describe, it, expect } from 'vitest';
import { BwrapBackend } from './bwrapBackend.js';

describe('BwrapBackend', () => {
  it('should have name = bwrap', () => {
    const backend = new BwrapBackend();
    expect(backend.name).toBe('bwrap');
  });

  it('should check availability based on platform', async () => {
    const backend = new BwrapBackend();
    const available = await backend.isAvailable();
    expect(typeof available).toBe('boolean');
  });

  it.skipIf(process.platform !== 'linux')('should execute a sandboxed command on Linux', async () => {
    const backend = new BwrapBackend();
    if (!(await backend.isAvailable())) return;

    const instance = {
      id: 'sb-bwrap-test',
      mode: 'ephemeral' as const,
      backend: 'bwrap' as const,
      status: 'running' as const,
      createdAt: Date.now(),
      resourceLimits: { memoryMB: 128, timeoutMs: 5000, networkWhitelist: [] },
    };

    await backend.create(instance);
    const result = await backend.execute(instance, 'echo', ['sandboxed']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('sandboxed');
    await backend.destroy(instance);
  });
});
