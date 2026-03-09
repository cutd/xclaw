import { describe, it, expect } from 'vitest';
import { buildStatusResponse } from './server.js';

describe('buildStatusResponse', () => {
  it('should build status payload with channels and uptime', () => {
    const status = buildStatusResponse({
      channels: ['telegram', 'discord'],
      sessions: 3,
      uptime: 12345,
    });
    expect(status.type).toBe('status.response');
    expect(status.payload.channels).toEqual(['telegram', 'discord']);
    expect(status.payload.sessions).toBe(3);
    expect(status.payload.uptime).toBe(12345);
  });

  it('should include timestamp and id', () => {
    const status = buildStatusResponse({
      channels: [],
      sessions: 0,
      uptime: 0,
    });
    expect(status.id).toBeDefined();
    expect(status.timestamp).toBeGreaterThan(0);
  });
});
