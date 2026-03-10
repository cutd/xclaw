import { describe, it, expect } from 'vitest';
import { statusCommand } from './status.js';

describe('status command', () => {
  it('should return error when gateway is not running', async () => {
    const result = await statusCommand('127.0.0.1', 19999);
    expect(result).toContain('Could not connect');
  });
});
