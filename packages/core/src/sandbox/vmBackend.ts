import { execFile } from 'node:child_process';
import type { SandboxBackendDriver, SandboxInstance, SandboxExecutionResult } from './types.js';

export class VmIsolateBackend implements SandboxBackendDriver {
  readonly name = 'vmIsolate' as const;

  async isAvailable(): Promise<boolean> {
    return true; // Always available — pure Node.js
  }

  async create(_instance: SandboxInstance): Promise<void> {
    // No setup needed for process-level isolation
  }

  execute(instance: SandboxInstance, command: string, args?: string[]): Promise<SandboxExecutionResult> {
    const start = Date.now();
    const timeoutMs = instance.resourceLimits.timeoutMs || 30000;

    return new Promise((resolve) => {
      execFile(
        command,
        args ?? [],
        {
          timeout: timeoutMs,
          maxBuffer: (instance.resourceLimits.memoryMB || 128) * 1024 * 1024,
          env: { ...process.env, XCLAW_SANDBOX: 'vmIsolate', XCLAW_SANDBOX_ID: instance.id },
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
    // No cleanup needed
  }
}
