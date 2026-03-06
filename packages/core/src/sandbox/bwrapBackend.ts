import { execFile } from 'node:child_process';
import type { SandboxBackendDriver, SandboxInstance, SandboxExecutionResult } from './types.js';

export class BwrapBackend implements SandboxBackendDriver {
  readonly name = 'bwrap' as const;

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'linux') return false;

    return new Promise((resolve) => {
      execFile('bwrap', ['--version'], (error) => {
        resolve(!error);
      });
    });
  }

  async create(_instance: SandboxInstance): Promise<void> {
    // No setup needed for bwrap
  }

  execute(instance: SandboxInstance, command: string, args?: string[]): Promise<SandboxExecutionResult> {
    const start = Date.now();
    const timeoutMs = instance.resourceLimits.timeoutMs || 30000;

    const bwrapArgs = [
      '--ro-bind', '/', '/',
      '--tmpfs', '/tmp',
      '--dev', '/dev',
      '--proc', '/proc',
      '--unshare-pid',
    ];

    if (!instance.resourceLimits.networkWhitelist.length) {
      bwrapArgs.push('--unshare-net');
    }

    bwrapArgs.push('--die-with-parent', command, ...(args ?? []));

    return new Promise((resolve) => {
      execFile(
        'bwrap',
        bwrapArgs,
        {
          timeout: timeoutMs,
          maxBuffer: (instance.resourceLimits.memoryMB || 128) * 1024 * 1024,
          env: { ...process.env, XCLAW_SANDBOX: 'bwrap', XCLAW_SANDBOX_ID: instance.id },
        },
        (error, stdout, stderr) => {
          const durationMs = Date.now() - start;
          const timedOut = error?.killed === true;

          resolve({
            exitCode: timedOut ? 124 : (error ? 1 : 0),
            stdout: stdout.toString(),
            stderr: stderr.toString(),
            durationMs,
            timedOut,
          });
        },
      );
    });
  }

  async destroy(_instance: SandboxInstance): Promise<void> {
    // No cleanup needed for bwrap
  }
}
