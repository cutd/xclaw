import { describe, it, expect } from 'vitest';
import { MacSandboxBackend } from './macSandboxBackend.js';

describe('MacSandboxBackend', () => {
  it('should have name = macSandbox', () => {
    const backend = new MacSandboxBackend();
    expect(backend.name).toBe('macSandbox');
  });

  it('should check availability based on platform', async () => {
    const backend = new MacSandboxBackend();
    const available = await backend.isAvailable();
    expect(typeof available).toBe('boolean');
  });

  it.skipIf(process.platform !== 'darwin')('should execute a sandboxed command on macOS', async () => {
    const backend = new MacSandboxBackend();
    if (!(await backend.isAvailable())) return;

    const instance = {
      id: 'sb-mac-test',
      mode: 'ephemeral' as const,
      backend: 'macSandbox' as const,
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
