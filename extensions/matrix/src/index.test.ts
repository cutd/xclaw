import { describe, it, expect, vi } from 'vitest';
import { MatrixExtension } from './index.js';

describe('MatrixExtension', () => {
  it('has correct manifest', () => {
    const ext = new MatrixExtension({ homeserverUrl: 'https://matrix.org', userId: '@bot:matrix.org', accessToken: 'tok' });
    expect(ext.manifest.name).toBe('matrix');
    expect(ext.manifest.type).toBe('extension');
    expect(ext.manifest.provides?.channels).toEqual(['matrix']);
  });

  it('provides channel helpers', () => {
    const ext = new MatrixExtension({ homeserverUrl: 'https://matrix.org', userId: '@bot:matrix.org', accessToken: 'tok' });
    expect(ext.providesChannels()).toEqual(['matrix']);
  });

  it('can register a message handler', () => {
    const ext = new MatrixExtension({ homeserverUrl: 'https://matrix.org', userId: '@bot:matrix.org', accessToken: 'tok' });
    const handler = vi.fn();
    ext.onMessage(handler);
    expect((ext as any).messageHandler).toBe(handler);
  });

  it('rejects send when not connected', async () => {
    const ext = new MatrixExtension({ homeserverUrl: 'https://matrix.org', userId: '@bot:matrix.org', accessToken: 'tok' });
    await expect(ext.send({
      targetChannel: 'matrix', targetUserId: '!room:matrix.org',
      targetSessionId: 'matrix-!room:matrix.org', content: { type: 'text', text: 'hello' },
    })).rejects.toThrow('Matrix not connected');
  });
});
