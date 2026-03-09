// packages/cli/src/commands/start.test.ts
import { describe, it, expect } from 'vitest';
import { resolveConfigPath } from './start.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

describe('startCommand helpers', () => {
  it('should resolve config path from env var', () => {
    process.env.XCLAW_CONFIG = '/tmp/custom.yaml';
    const path = resolveConfigPath();
    expect(path).toBe('/tmp/custom.yaml');
    delete process.env.XCLAW_CONFIG;
  });

  it('should fall back to default config path', () => {
    delete process.env.XCLAW_CONFIG;
    const path = resolveConfigPath();
    expect(path).toBe(join(homedir(), '.xclaw', 'xclaw.config.yaml'));
  });
});
