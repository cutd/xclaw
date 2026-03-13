import { describe, it, expect, vi } from 'vitest';
import { IrcExtension } from './index.js';

describe('IrcExtension', () => {
  it('has correct manifest', () => {
    const ext = new IrcExtension({ host: 'irc.libera.chat', port: 6697, nick: 'xclawbot', channels: ['#test'] });
    expect(ext.manifest.name).toBe('irc');
    expect(ext.manifest.type).toBe('extension');
    expect(ext.manifest.provides?.channels).toEqual(['irc']);
  });

  it('provides channel helpers', () => {
    const ext = new IrcExtension({ host: 'irc.libera.chat', port: 6697, nick: 'xclawbot', channels: ['#test'] });
    expect(ext.providesChannels()).toEqual(['irc']);
  });

  it('can register a message handler', () => {
    const ext = new IrcExtension({ host: 'irc.libera.chat', port: 6697, nick: 'xclawbot', channels: ['#test'] });
    const handler = vi.fn();
    ext.onMessage(handler);
    expect((ext as any).messageHandler).toBe(handler);
  });

  it('rejects send when not connected', async () => {
    const ext = new IrcExtension({ host: 'irc.libera.chat', port: 6697, nick: 'xclawbot', channels: ['#test'] });
    await expect(ext.send({
      targetChannel: 'irc', targetUserId: 'someone',
      targetSessionId: 'irc-#test', content: { type: 'text', text: 'hello' },
    })).rejects.toThrow('IRC not connected');
  });
});
