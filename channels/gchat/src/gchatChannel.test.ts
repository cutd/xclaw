import { describe, it, expect, vi } from 'vitest';
import { GChatChannel } from './gchatChannel.js';

vi.mock('googleapis', () => ({
  google: {
    chat: vi.fn().mockReturnValue({
      spaces: {
        messages: {
          create: vi.fn().mockResolvedValue({ data: { name: 'spaces/xxx/messages/yyy' } }),
        },
      },
    }),
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({
        getClient: vi.fn().mockResolvedValue({}),
      })),
    },
  },
}));

describe('GChatChannel', () => {
  it('should have correct manifest', () => {
    const ch = new GChatChannel({ serviceAccountKey: '{}', enabled: true });
    expect(ch.manifest.name).toBe('gchat');
    expect(ch.manifest.type).toBe('channel');
  });

  it('should normalize a Google Chat message', () => {
    const ch = new GChatChannel({ serviceAccountKey: '{}', enabled: true });
    const msg = ch.normalizeMessage({
      sender: { name: 'users/12345', displayName: 'User' },
      space: { name: 'spaces/AAAA' },
      text: 'Hello Google Chat',
      createTime: '2023-11-15T00:00:00.000000Z',
      name: 'spaces/AAAA/messages/BBBB',
    });
    expect(msg.content.text).toBe('Hello Google Chat');
    expect(msg.source.channel).toBe('gchat');
    expect(msg.source.userId).toBe('users/12345');
    expect(msg.source.sessionId).toBe('spaces/AAAA');
  });

  it('should chunk at Google Chat limit (4096)', () => {
    const ch = new GChatChannel({ serviceAccountKey: '{}', enabled: true });
    const chunks = ch.chunkMessage('A'.repeat(5000), 4096);
    expect(chunks.length).toBe(2);
  });
});
