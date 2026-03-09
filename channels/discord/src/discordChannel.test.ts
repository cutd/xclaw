import { describe, it, expect, vi } from 'vitest';
import { DiscordChannel } from './discordChannel.js';

vi.mock('discord.js', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      login: vi.fn().mockResolvedValue('token'),
      destroy: vi.fn(),
      user: { id: 'bot-123', username: 'xclaw' },
    })),
    GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 4, DirectMessages: 8 },
    Partials: { Channel: 0 },
  };
});

describe('DiscordChannel', () => {
  it('should have correct manifest', () => {
    const channel = new DiscordChannel({ token: 'fake', enabled: true });
    expect(channel.manifest.name).toBe('discord');
    expect(channel.manifest.type).toBe('channel');
  });

  it('should normalize a Discord message', () => {
    const channel = new DiscordChannel({ token: 'fake', enabled: true });
    const msg = channel.normalizeMessage({
      id: 'msg-1',
      author: { id: 'user-1' },
      channelId: 'ch-1',
      content: 'Hello from Discord',
      createdTimestamp: 1700000000000,
    });
    expect(msg.content.text).toBe('Hello from Discord');
    expect(msg.source.channel).toBe('discord');
    expect(msg.source.userId).toBe('user-1');
  });

  it('should detect mentions', () => {
    const channel = new DiscordChannel({ token: 'fake', enabled: true });
    expect(channel.detectMention('<@bot-123> hello', 'bot-123')).toBe(true);
    expect(channel.detectMention('hello', 'bot-123')).toBe(false);
  });

  it('should chunk at Discord limit (2000)', () => {
    const channel = new DiscordChannel({ token: 'fake', enabled: true });
    const chunks = channel.chunkMessage('A'.repeat(3000), 2000);
    expect(chunks.length).toBe(2);
  });
});
