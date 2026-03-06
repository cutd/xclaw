import { execFile } from 'node:child_process';
import type { SandboxBackendDriver, SandboxInstance, SandboxExecutionResult } from './types.js';

const SANDBOX_PROFILE = `\
(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow file-read*)
(allow file-write* (subpath "/tmp"))
(allow file-write* (subpath "/dev"))
(allow sysctl-read)
(allow mach-lookup)`;

export class MacSandboxBackend implements SandboxBackendDriver {
  readonly name = 'macSandbox' as const;

  async isAvailable(): Promise<boolean> {
    if (process.platform !== 'darwin') return false;

    return new Promise((resolve) => {
      execFile('sandbox-exec', ['-n', 'no-internet', 'true'], (error) => {
        resolve(!error);
      });
    });
  }

  async create(_instance: SandboxInstance): Promise<void> {
    // No setup needed for sandbox-exec
  }

  execute(instance: SandboxInstance, command: string, args?: string[]): Promise<SandboxExecutionResult> {
    const start = Date.now();
    const timeoutMs = instance.resourceLimits.timeoutMs || 30000;

    return new Promise((resolve) => {
      execFile(
        'sandbox-exec',
        ['-p', SANDBOX_PROFILE, command, ...(args ?? [])],
        {
          timeout: timeoutMs,
          maxBuffer: (instance.resourceLimits.memoryMB || 128) * 1024 * 1024,
          env: { ...process.env, XCLAW_SANDBOX: 'macSandbox', XCLAW_SANDBOX_ID: instance.id },
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
    // No cleanup needed for sandbox-exec
  }
}
