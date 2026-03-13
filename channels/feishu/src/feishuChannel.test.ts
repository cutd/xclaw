import { describe, it, expect, vi } from 'vitest';
import { FeishuChannel } from './feishuChannel.js';

vi.mock('@larksuiteoapi/node-sdk', () => ({
  Client: vi.fn().mockImplementation(() => ({
    im: { message: { create: vi.fn().mockResolvedValue({ data: {} }) } },
  })),
  EventDispatcher: vi.fn().mockImplementation(() => ({ register: vi.fn() })),
}));

describe('FeishuChannel', () => {
  it('should have correct manifest', () => {
    const ch = new FeishuChannel({ appId: 'id', appSecret: 'secret', enabled: true });
    expect(ch.manifest.name).toBe('feishu');
    expect(ch.manifest.type).toBe('channel');
  });

  it('should normalize a Feishu message', () => {
    const ch = new FeishuChannel({ appId: 'id', appSecret: 'secret', enabled: true });
    const msg = ch.normalizeMessage({
      sender: { sender_id: { open_id: 'ou_123' } },
      message: {
        chat_id: 'oc_456',
        content: JSON.stringify({ text: 'Hello Feishu' }),
        message_id: 'msg-1',
        create_time: '1700000000000',
      },
    });
    expect(msg.content.text).toBe('Hello Feishu');
    expect(msg.source.userId).toBe('ou_123');
    expect(msg.source.sessionId).toBe('oc_456');
  });

  it('should chunk at Feishu limit (4096)', () => {
    const ch = new FeishuChannel({ appId: 'id', appSecret: 'secret', enabled: true });
    const chunks = ch.chunkMessage('A'.repeat(5000), 4096);
    expect(chunks.length).toBe(2);
  });

  it('handles incoming webhook event', async () => {
    const channel = new FeishuChannel({ appId: 'id', appSecret: 'secret', enabled: true });
    const handler = vi.fn();
    channel.onMessage(handler);

    await channel.handleWebhookEvent({
      header: { event_type: 'im.message.receive_v1' },
      event: {
        message: {
          message_id: 'msg-123',
          content: JSON.stringify({ text: 'hello' }),
          message_type: 'text',
          chat_id: 'chat-456',
          create_time: '1700000000000',
        },
        sender: { sender_id: { open_id: 'user-123' } },
      },
    });

    expect(handler).toHaveBeenCalledOnce();
    const msg = handler.mock.calls[0][0];
    expect(msg.content.text).toBe('hello');
    expect(msg.source.userId).toBe('user-123');
  });

  it('ignores non-message webhook events', async () => {
    const channel = new FeishuChannel({ appId: 'id', appSecret: 'secret', enabled: true });
    const handler = vi.fn();
    channel.onMessage(handler);

    await channel.handleWebhookEvent({
      header: { event_type: 'im.chat.disbanded_v1' },
      event: {},
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores webhook events with no handler registered', async () => {
    const channel = new FeishuChannel({ appId: 'id', appSecret: 'secret', enabled: true });

    // Should not throw even without a handler
    await expect(
      channel.handleWebhookEvent({
        header: { event_type: 'im.message.receive_v1' },
        event: {
          message: {
            message_id: 'msg-999',
            content: JSON.stringify({ text: 'orphan' }),
            message_type: 'text',
            chat_id: 'chat-789',
            create_time: '1700000000000',
          },
          sender: { sender_id: { open_id: 'user-999' } },
        },
      }),
    ).resolves.toBeUndefined();
  });
});
