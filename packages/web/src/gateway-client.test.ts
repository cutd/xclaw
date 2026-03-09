import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GatewayClient } from './gateway-client.js';

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  send(data: string) { this.sent.push(data); }
  close() { this.readyState = MockWebSocket.CLOSED; }

  simulateOpen() { this.onopen?.(); }
  simulateMessage(data: object) { this.onmessage?.({ data: JSON.stringify(data) }); }
  simulateClose() { this.onclose?.(); }
}

describe('GatewayClient', () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
    vi.stubGlobal('WebSocket', vi.fn(() => mockWs));
  });

  it('should connect and emit connected state', () => {
    const client = new GatewayClient('ws://localhost:18789');
    client.connect();
    mockWs.simulateOpen();
    expect(client.state).toBe('connected');
  });

  it('should send typed messages', () => {
    const client = new GatewayClient('ws://localhost:18789');
    client.connect();
    mockWs.simulateOpen();
    client.sendChatMessage('Hello');
    expect(mockWs.sent).toHaveLength(2); // session.create + chat.message
    const msg = JSON.parse(mockWs.sent[1]);
    expect(msg.type).toBe('chat.message');
    expect(msg.payload.text).toBe('Hello');
  });

  it('should receive and dispatch messages', () => {
    const client = new GatewayClient('ws://localhost:18789');
    const received: any[] = [];
    client.on('chat.response', (msg) => received.push(msg));
    client.connect();
    mockWs.simulateOpen();
    mockWs.simulateMessage({ type: 'chat.response', id: '1', payload: { text: 'Hi' }, timestamp: Date.now() });
    expect(received).toHaveLength(1);
    expect(received[0].payload.text).toBe('Hi');
  });

  it('should track reconnecting state on close', () => {
    const client = new GatewayClient('ws://localhost:18789');
    client.connect();
    mockWs.simulateOpen();
    mockWs.simulateClose();
    expect(client.state).toBe('reconnecting');
  });

  it('should create session on connect', () => {
    const client = new GatewayClient('ws://localhost:18789');
    client.connect();
    mockWs.simulateOpen();
    expect(mockWs.sent.length).toBeGreaterThanOrEqual(1);
    const sessionMsg = JSON.parse(mockWs.sent[0]);
    expect(sessionMsg.type).toBe('session.create');
  });

  it('should store sessionId from server response', () => {
    const client = new GatewayClient('ws://localhost:18789');
    client.connect();
    mockWs.simulateOpen();
    mockWs.simulateMessage({ type: 'session.create', id: '1', payload: { sessionId: 'sess-123' }, timestamp: Date.now() });
    expect(client.sessionId).toBe('sess-123');
  });

  it('should disconnect cleanly', () => {
    const client = new GatewayClient('ws://localhost:18789');
    client.connect();
    mockWs.simulateOpen();
    client.disconnect();
    expect(client.state).toBe('disconnected');
  });
});
