import { describe, it, expect, vi } from 'vitest';
import { IMessageExtension } from './index.js';

describe('IMessageExtension', () => {
  it('has correct manifest', () => {
    const ext = new IMessageExtension({ serverUrl: 'http://localhost:1234', password: 'test' });
    expect(ext.manifest.name).toBe('imessage');
    expect(ext.manifest.type).toBe('extension');
    expect(ext.manifest.provides?.channels).toEqual(['imessage']);
  });

  it('can register a message handler', () => {
    const ext = new IMessageExtension({ serverUrl: 'http://localhost:1234', password: 'test' });
    const handler = vi.fn();
    ext.onMessage(handler);
    expect((ext as any).messageHandler).toBe(handler);
  });
});
