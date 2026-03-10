import { describe, it, expect } from 'vitest';
import { stopCommand } from './stop.js';

describe('stop command', () => {
  it('should return error message when gateway is not running', async () => {
    const result = await stopCommand('127.0.0.1', 19999);
    expect(result).toContain('Could not connect');
  });
});
