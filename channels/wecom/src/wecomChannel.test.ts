import { describe, it, expect } from 'vitest';
import { WeComChannel } from './wecomChannel.js';

describe('WeComChannel', () => {
  it('should have correct manifest', () => {
    const ch = new WeComChannel({ corpId: 'id', secret: 'secret', agentId: 1000, enabled: true });
    expect(ch.manifest.name).toBe('wecom');
    expect(ch.manifest.type).toBe('channel');
  });

  it('should normalize a WeCom message', () => {
    const ch = new WeComChannel({ corpId: 'id', secret: 'secret', agentId: 1000, enabled: true });
    const msg = ch.normalizeMessage({
      FromUserName: 'user-1',
      MsgType: 'text',
      Content: 'Hello WeCom',
      CreateTime: 1700000000,
    });
    expect(msg.content.text).toBe('Hello WeCom');
    expect(msg.source.userId).toBe('user-1');
  });

  it('should chunk at WeCom limit (2048)', () => {
    const ch = new WeComChannel({ corpId: 'id', secret: 'secret', agentId: 1000, enabled: true });
    const chunks = ch.chunkMessage('A'.repeat(3000), 2048);
    expect(chunks.length).toBe(2);
  });
});
