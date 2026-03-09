import { describe, it, expect, vi } from 'vitest';
import { TeamsChannel } from './teamsChannel.js';

vi.mock('botbuilder', () => ({
  CloudAdapter: vi.fn().mockImplementation(() => ({
    process: vi.fn(),
    continueConversationAsync: vi.fn().mockResolvedValue(undefined),
  })),
  ConfigurationBotFrameworkAuthentication: vi.fn().mockImplementation(() => ({})),
}));

describe('TeamsChannel', () => {
  it('should have correct manifest', () => {
    const ch = new TeamsChannel({ appId: 'id', appPassword: 'pass', enabled: true });
    expect(ch.manifest.name).toBe('teams');
    expect(ch.manifest.type).toBe('channel');
  });

  it('should normalize a Teams activity', () => {
    const ch = new TeamsChannel({ appId: 'id', appPassword: 'pass', enabled: true });
    const msg = ch.normalizeMessage({
      id: 'act-1',
      from: { id: 'user-1', name: 'User' },
      conversation: { id: 'conv-1' },
      text: 'Hello Teams',
      timestamp: '2023-11-15T00:00:00.000Z',
    });
    expect(msg.content.text).toBe('Hello Teams');
    expect(msg.source.channel).toBe('teams');
    expect(msg.source.userId).toBe('user-1');
    expect(msg.source.sessionId).toBe('conv-1');
  });

  it('should chunk at Teams limit (28000)', () => {
    const ch = new TeamsChannel({ appId: 'id', appPassword: 'pass', enabled: true });
    const chunks = ch.chunkMessage('A'.repeat(30000), 28000);
    expect(chunks.length).toBe(2);
  });
});
