import { describe, it, expect } from 'vitest';
import { sandboxInfo } from './sandboxCmd.js';

describe('sandbox command', () => {
  it('should return sandbox information', () => {
    const info = sandboxInfo();
    expect(info).toContain('Platform');
    expect(info).toContain('Backend');
    expect(info).toContain('Default mode');
  });
});
