import { describe, it, expect } from 'vitest';
import type {
  GatewaySession,
  ClientConnection,
  GatewayMessage,
  GatewayMessageType,
} from './types.js';

describe('Gateway types', () => {
  it('should accept a valid session', () => {
    const session: GatewaySession = {
      id: 'sess-001',
      userId: 'user-123',
      channel: 'cli',
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      metadata: {},
    };
    expect(session.id).toBe('sess-001');
  });

  it('should accept a client connection', () => {
    const conn: ClientConnection = {
      id: 'conn-001',
      clientType: 'cli',
      connectedAt: Date.now(),
      sessionId: 'sess-001',
    };
    expect(conn.clientType).toBe('cli');
  });

  it('should accept gateway protocol messages', () => {
    const msg: GatewayMessage = {
      type: 'chat.message',
      id: 'msg-001',
      payload: { text: 'hello' },
      timestamp: Date.now(),
    };
    expect(msg.type).toBe('chat.message');
  });
});
