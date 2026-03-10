import { describe, it, expect } from 'vitest';
import { sendCommand } from './send.js';

describe('send command', () => {
  it('should return error when gateway is not running', async () => {
    const result = await sendCommand('hello', '127.0.0.1', 19999);
    expect(result).toContain('Could not connect');
  });
});
