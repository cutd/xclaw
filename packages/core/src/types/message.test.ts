import { describe, it, expect } from 'vitest';
import type { UnifiedMessage, MessageSource, MessageContent } from './message.js';

describe('UnifiedMessage type', () => {
  it('should accept a valid unified message', () => {
    const msg: UnifiedMessage = {
      id: 'msg-001',
      source: { channel: 'telegram', userId: 'user-123', sessionId: 'sess-456' },
      content: { type: 'text', text: 'Hello xclaw' },
      timestamp: Date.now(),
    };
    expect(msg.id).toBe('msg-001');
    expect(msg.source.channel).toBe('telegram');
    expect(msg.content.type).toBe('text');
  });

  it('should accept a message with metadata', () => {
    const msg: UnifiedMessage = {
      id: 'msg-002',
      source: { channel: 'cli', userId: 'local', sessionId: 'cli-sess' },
      content: { type: 'text', text: 'test' },
      timestamp: Date.now(),
      metadata: { replyTo: 'msg-001' },
    };
    expect(msg.metadata?.replyTo).toBe('msg-001');
  });
});
