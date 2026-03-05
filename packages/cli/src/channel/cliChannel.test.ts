import { describe, it, expect } from 'vitest';
import { CLIChannel } from './cliChannel.js';

describe('CLIChannel', () => {
  it('should have correct manifest', () => {
    const channel = new CLIChannel();
    expect(channel.manifest.name).toBe('cli');
    expect(channel.manifest.type).toBe('channel');
  });

  it('should format outgoing messages as text', () => {
    const channel = new CLIChannel();
    const formatted = channel.formatOutput({
      targetChannel: 'cli',
      targetUserId: 'local',
      targetSessionId: 'cli-sess',
      content: { type: 'text', text: 'Hello from xclaw!' },
    });
    expect(formatted).toBe('Hello from xclaw!');
  });
});
