import { describe, it, expect, vi } from 'vitest';
import { WhatsAppExtension } from './index.js';

describe('WhatsAppExtension', () => {
  it('has correct manifest', () => {
    const ext = new WhatsAppExtension({ authDir: '/tmp/wa-test' });
    expect(ext.manifest.name).toBe('whatsapp');
    expect(ext.manifest.type).toBe('extension');
    expect(ext.manifest.provides?.channels).toEqual(['whatsapp']);
  });

  it('provides channel helpers', () => {
    const ext = new WhatsAppExtension({ authDir: '/tmp/wa-test' });
    expect(ext.providesChannels()).toEqual(['whatsapp']);
  });

  it('can register a message handler', () => {
    const ext = new WhatsAppExtension({ authDir: '/tmp/wa-test' });
    const handler = vi.fn();
    ext.onMessage(handler);
    expect((ext as any).messageHandler).toBe(handler);
  });

  it('rejects send when not connected', async () => {
    const ext = new WhatsAppExtension({ authDir: '/tmp/wa-test' });
    await expect(ext.send({
      targetChannel: 'whatsapp', targetUserId: '123@s.whatsapp.net',
      targetSessionId: 'wa-123', content: { type: 'text', text: 'hello' },
    })).rejects.toThrow('WhatsApp not connected');
  });
});
