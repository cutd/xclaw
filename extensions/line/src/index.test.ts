import { describe, it, expect, vi } from 'vitest';
import { LineExtension } from './index.js';

describe('LineExtension', () => {
  it('has correct manifest', () => {
    const ext = new LineExtension({ channelSecret: 'secret', channelAccessToken: 'token' });
    expect(ext.manifest.name).toBe('line');
    expect(ext.manifest.type).toBe('extension');
    expect(ext.manifest.provides?.channels).toEqual(['line']);
  });

  it('provides channel helpers', () => {
    const ext = new LineExtension({ channelSecret: 'secret', channelAccessToken: 'token' });
    expect(ext.providesChannels()).toEqual(['line']);
  });

  it('can register a message handler', () => {
    const ext = new LineExtension({ channelSecret: 'secret', channelAccessToken: 'token' });
    const handler = vi.fn();
    ext.onMessage(handler);
    expect((ext as any).messageHandler).toBe(handler);
  });

  it('verifies LINE signature correctly', () => {
    const ext = new LineExtension({ channelSecret: 'test-secret', channelAccessToken: 'token' });
    const body = '{"events":[]}';
    // Compute expected HMAC-SHA256 base64 of body with secret 'test-secret'
    const { createHmac } = require('node:crypto');
    const expected = createHmac('SHA256', 'test-secret').update(body).digest('base64');
    expect(ext.verifySignature(body, expected)).toBe(true);
    expect(ext.verifySignature(body, 'wrong-signature')).toBe(false);
  });
});
