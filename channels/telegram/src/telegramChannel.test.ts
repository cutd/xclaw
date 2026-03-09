import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramChannel } from './telegramChannel.js';

// Mock telegraf
vi.mock('telegraf', () => {
  const handlers: Record<string, Function> = {};
  return {
    Telegraf: vi.fn().mockImplementation(() => ({
      on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }),
      launch: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      telegram: {
        sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
      },
      botInfo: { id: 123, is_bot: true, first_name: 'xclaw', username: 'xclaw_bot' },
      _handlers: handlers,
    })),
  };
});

describe('TelegramChannel', () => {
  it('should have correct manifest', () => {
    const channel = new TelegramChannel({ token: 'fake-token', enabled: true });
    expect(channel.manifest.name).toBe('telegram');
    expect(channel.manifest.type).toBe('channel');
  });

  it('should normalize a Telegram text message to UnifiedMessage', () => {
    const channel = new TelegramChannel({ token: 'fake-token', enabled: true });
    const raw = {
      message: {
        message_id: 42,
        from: { id: 111, first_name: 'User' },
        chat: { id: 222, type: 'private' },
        text: 'Hello bot',
        date: 1700000000,
      },
    };
    const msg = channel.normalizeMessage(raw);
    expect(msg.content.text).toBe('Hello bot');
    expect(msg.source.channel).toBe('telegram');
    expect(msg.source.userId).toBe('111');
    expect(msg.source.sessionId).toBe('222');
  });

  it('should chunk long messages using Telegram limit (4096)', () => {
    const channel = new TelegramChannel({ token: 'fake-token', enabled: true });
    const long = 'A'.repeat(5000);
    const chunks = channel.chunkMessage(long, 4096);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toHaveLength(4096);
  });

  it('should detect mentions in group messages', () => {
    const channel = new TelegramChannel({ token: 'fake-token', enabled: true });
    const isMention = channel.detectMention('@xclaw_bot hello', 'xclaw_bot');
    expect(isMention).toBe(true);

    const notMention = channel.detectMention('hello', 'xclaw_bot');
    expect(notMention).toBe(false);
  });
});
