import { describe, it, expect, vi } from 'vitest';
import { MattermostChannel } from './mattermostChannel.js';

vi.mock('@mattermost/client', () => ({
  Client4: vi.fn().mockImplementation(() => ({
    setUrl: vi.fn(),
    setToken: vi.fn(),
    createPost: vi.fn().mockResolvedValue({ id: 'post-1' }),
    getMe: vi.fn().mockResolvedValue({ id: 'bot-1', username: 'xclaw' }),
  })),
  WebSocketClient: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    addMessageListener: vi.fn(),
    close: vi.fn(),
  })),
}));

describe('MattermostChannel', () => {
  it('should have correct manifest', () => {
    const ch = new MattermostChannel({ url: 'https://mm.example.com', token: 'fake', enabled: true });
    expect(ch.manifest.name).toBe('mattermost');
    expect(ch.manifest.type).toBe('channel');
  });

  it('should normalize a Mattermost post', () => {
    const ch = new MattermostChannel({ url: 'https://mm.example.com', token: 'fake', enabled: true });
    const msg = ch.normalizeMessage({
      id: 'post-1',
      user_id: 'user-1',
      channel_id: 'ch-1',
      message: 'Hello Mattermost',
      create_at: 1700000000000,
    });
    expect(msg.content.text).toBe('Hello Mattermost');
    expect(msg.source.channel).toBe('mattermost');
    expect(msg.source.userId).toBe('user-1');
    expect(msg.source.sessionId).toBe('ch-1');
  });

  it('should chunk at Mattermost limit (16383)', () => {
    const ch = new MattermostChannel({ url: 'https://mm.example.com', token: 'fake', enabled: true });
    const chunks = ch.chunkMessage('A'.repeat(20000), 16383);
    expect(chunks.length).toBe(2);
  });
});
