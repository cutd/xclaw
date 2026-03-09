import { describe, it, expect } from 'vitest';
import { formatChannelList } from './channel.js';

describe('Channel CLI helpers', () => {
  it('should format channel list', () => {
    const channels = [
      { name: 'telegram', enabled: true },
      { name: 'discord', enabled: false },
      { name: 'cli', enabled: true },
    ];
    const output = formatChannelList(channels);
    expect(output).toContain('telegram');
    expect(output).toContain('enabled');
    expect(output).toContain('disabled');
  });

  it('should handle empty channel list', () => {
    const output = formatChannelList([]);
    expect(output).toContain('No channels');
  });
});
