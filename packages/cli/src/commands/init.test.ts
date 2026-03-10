import { describe, it, expect } from 'vitest';
import { buildConfigYaml } from './init.js';

describe('init command', () => {
  it('should generate valid YAML config', () => {
    const yaml = buildConfigYaml({ provider: 'anthropic', apiKey: 'sk-test', model: 'claude-sonnet-4-5' });
    expect(yaml).toContain('anthropic');
    expect(yaml).toContain('claude-sonnet-4-5');
    expect(yaml).toContain('version');
  });
});
