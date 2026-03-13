import { describe, it, expect, vi } from 'vitest';
import { SignalExtension } from './index.js';

describe('SignalExtension', () => {
  it('has correct manifest', () => {
    const ext = new SignalExtension({ signalCliPath: '/usr/bin/signal-cli', account: '+1234567890' });
    expect(ext.manifest.name).toBe('signal');
    expect(ext.manifest.type).toBe('extension');
    expect(ext.manifest.provides?.channels).toEqual(['signal']);
  });

  it('can register a message handler', () => {
    const ext = new SignalExtension({ signalCliPath: '/usr/bin/signal-cli', account: '+1234567890' });
    const handler = vi.fn();
    ext.onMessage(handler);
    expect((ext as any).messageHandler).toBe(handler);
  });

  it('rejects send when not connected', async () => {
    const ext = new SignalExtension({ signalCliPath: '/usr/bin/signal-cli', account: '+1234567890' });
    await expect(ext.send({
      targetChannel: 'signal', targetUserId: '+9876543210',
      targetSessionId: 'signal-+9876543210', content: { type: 'text', text: 'hello' },
    })).rejects.toThrow('Signal not connected');
  });
});
