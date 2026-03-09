import { describe, it, expect, vi } from 'vitest';
import { SlackChannel } from './slackChannel.js';

vi.mock('@slack/bolt', () => ({
  App: vi.fn().mockImplementation(() => ({
    message: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    client: { chat: { postMessage: vi.fn().mockResolvedValue({ ok: true }) } },
  })),
}));

describe('SlackChannel', () => {
  it('should have correct manifest', () => {
    const ch = new SlackChannel({ token: 'xoxb-fake', appToken: 'xapp-fake', signingSecret: 'secret', enabled: true });
    expect(ch.manifest.name).toBe('slack');
    expect(ch.manifest.type).toBe('channel');
  });

  it('should normalize a Slack message', () => {
    const ch = new SlackChannel({ token: 'x', appToken: 'x', signingSecret: 'x', enabled: true });
    const msg = ch.normalizeMessage({ text: 'Hello', user: 'U123', channel: 'C456', ts: '1700000000.000000' });
    expect(msg.content.text).toBe('Hello');
    expect(msg.source.userId).toBe('U123');
    expect(msg.source.sessionId).toBe('C456');
  });

  it('should detect bot mention', () => {
    const ch = new SlackChannel({ token: 'x', appToken: 'x', signingSecret: 'x', enabled: true });
    expect(ch.detectMention('<@U_BOT> hello', 'U_BOT')).toBe(true);
    expect(ch.detectMention('hello', 'U_BOT')).toBe(false);
  });

  it('should chunk at Slack limit (40000)', () => {
    const ch = new SlackChannel({ token: 'x', appToken: 'x', signingSecret: 'x', enabled: true });
    const chunks = ch.chunkMessage('A'.repeat(50000), 40000);
    expect(chunks.length).toBe(2);
  });
});
