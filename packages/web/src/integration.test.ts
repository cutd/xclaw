// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GatewayClient } from './gateway-client.js';
import './components/chat/chat-view.js';

class MockWebSocket {
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; }

  simulateOpen() { this.onopen?.(); }
  simulateMessage(data: object) { this.onmessage?.({ data: JSON.stringify(data) }); }
  simulateClose() { this.onclose?.(); }
}

describe('Web UI Integration', () => {
  let mockWs: MockWebSocket;
  let client: GatewayClient;

  beforeEach(() => {
    mockWs = new MockWebSocket();
    vi.stubGlobal('WebSocket', vi.fn(() => mockWs));
    client = new GatewayClient('ws://localhost:18789');
  });

  it('should complete full chat flow: connect -> send -> receive -> render', async () => {
    // 1. Connect
    client.connect();
    mockWs.simulateOpen();
    expect(client.state).toBe('connected');

    // 2. Simulate session creation response
    mockWs.simulateMessage({
      type: 'session.create',
      id: 'resp-1',
      payload: { sessionId: 'sess-abc' },
      timestamp: Date.now(),
    });
    expect(client.sessionId).toBe('sess-abc');

    // 3. Create chat-view with client
    const chatView = document.createElement('chat-view') as any;
    chatView.client = client;
    document.body.appendChild(chatView);
    await chatView.updateComplete;

    // 4. Verify empty state
    expect(chatView.shadowRoot!.querySelector('.empty')).not.toBeNull();

    // 5. Simulate user sending a message by setting input and triggering send
    const input = chatView.shadowRoot!.querySelector('input') as HTMLInputElement;
    input.value = 'Hello AI';
    input.dispatchEvent(new Event('input'));
    await chatView.updateComplete;
    const sendButton = chatView.shadowRoot!.querySelector('button') as HTMLButtonElement;
    sendButton.click();
    await chatView.updateComplete;

    // 6. Verify user message was sent via WebSocket
    const sentMessages = mockWs.sent.filter((s) => {
      const msg = JSON.parse(s);
      return msg.type === 'chat.message';
    });
    expect(sentMessages).toHaveLength(1);
    expect(JSON.parse(sentMessages[0]).payload.text).toBe('Hello AI');

    // 7. Verify user message appears in the list
    let messageItems = chatView.shadowRoot!.querySelectorAll('message-item');
    expect(messageItems).toHaveLength(1);

    // 8. Simulate assistant response
    mockWs.simulateMessage({
      type: 'chat.response',
      id: 'resp-2',
      payload: { text: 'Hello! How can I help?' },
      timestamp: Date.now(),
    });
    await chatView.updateComplete;

    // 9. Verify both messages are rendered
    messageItems = chatView.shadowRoot!.querySelectorAll('message-item');
    expect(messageItems).toHaveLength(2);

    document.body.removeChild(chatView);
  });

  it('should handle streaming response flow', async () => {
    client.connect();
    mockWs.simulateOpen();

    const chatView = document.createElement('chat-view') as any;
    chatView.client = client;
    document.body.appendChild(chatView);
    await chatView.updateComplete;

    // 1. Stream start
    mockWs.simulateMessage({
      type: 'chat.stream_start',
      id: 'stream-1',
      payload: {},
      timestamp: Date.now(),
    });
    await chatView.updateComplete;

    let messageItems = chatView.shadowRoot!.querySelectorAll('message-item');
    expect(messageItems).toHaveLength(1);
    expect((messageItems[0] as any).streaming).toBe(true);

    // 2. Stream blocks
    mockWs.simulateMessage({
      type: 'chat.stream_block',
      id: 'block-1',
      payload: { content: 'Hello ' },
      timestamp: Date.now(),
    });
    mockWs.simulateMessage({
      type: 'chat.stream_block',
      id: 'block-2',
      payload: { content: 'world!' },
      timestamp: Date.now(),
    });
    await chatView.updateComplete;

    messageItems = chatView.shadowRoot!.querySelectorAll('message-item');
    expect((messageItems[0] as any).text).toBe('Hello world!');
    expect((messageItems[0] as any).streaming).toBe(true);

    // 3. Stream end
    mockWs.simulateMessage({
      type: 'chat.stream_end',
      id: 'end-1',
      payload: {},
      timestamp: Date.now(),
    });
    await chatView.updateComplete;

    messageItems = chatView.shadowRoot!.querySelectorAll('message-item');
    expect((messageItems[0] as any).streaming).toBe(false);
    expect((messageItems[0] as any).text).toBe('Hello world!');

    document.body.removeChild(chatView);
  });

  it('should handle reconnection state changes', () => {
    client.connect();
    mockWs.simulateOpen();
    expect(client.state).toBe('connected');

    mockWs.simulateClose();
    expect(client.state).toBe('reconnecting');

    client.disconnect();
    expect(client.state).toBe('disconnected');
  });
});
