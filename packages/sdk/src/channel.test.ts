import { describe, it, expect, vi } from 'vitest';
import { BaseChannelPlugin, type MessageHandler } from './channel.js';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';

// Concrete test implementation
class TestChannel extends BaseChannelPlugin {
  manifest: PluginManifest = { name: 'test', version: '0.1.0', description: 'Test', type: 'channel' };
  connected = false;

  async onLoad(): Promise<void> { this.connected = true; }
  async onUnload(): Promise<void> { this.connected = false; }
  async send(msg: OutgoingMessage): Promise<void> {}
}

describe('BaseChannelPlugin', () => {
  describe('chunkMessage', () => {
    it('should return single chunk for short messages', () => {
      const channel = new TestChannel();
      const chunks = channel.chunkMessage('Hello world', 100);
      expect(chunks).toEqual(['Hello world']);
    });

    it('should split at paragraph boundaries', () => {
      const channel = new TestChannel();
      const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
      const chunks = channel.chunkMessage(text, 30);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toContain('Paragraph one.');
    });

    it('should hard-cut when no natural break point', () => {
      const channel = new TestChannel();
      const text = 'A'.repeat(100);
      const chunks = channel.chunkMessage(text, 40);
      expect(chunks.length).toBe(3);
      expect(chunks[0]).toHaveLength(40);
    });

    it('should throw when maxLength is zero or negative', () => {
      const channel = new TestChannel();
      expect(() => channel.chunkMessage('hello', 0)).toThrow('maxLength must be positive');
      expect(() => channel.chunkMessage('hello', -5)).toThrow('maxLength must be positive');
    });
  });

  describe('reconnect', () => {
    it('should return delay based on exponential backoff', () => {
      const channel = new TestChannel();
      const delay0 = channel.getReconnectDelay(0);
      const delay1 = channel.getReconnectDelay(1);
      const delay5 = channel.getReconnectDelay(5);
      expect(delay0).toBe(1000);
      expect(delay1).toBe(2000);
      expect(delay5).toBeLessThanOrEqual(60000);
    });

    it('should cap at max delay', () => {
      const channel = new TestChannel();
      const delay = channel.getReconnectDelay(100);
      expect(delay).toBeLessThanOrEqual(60000);
    });

    it('should respect custom ReconnectOptions', () => {
      const channel = new TestChannel();
      const options = { baseDelay: 500, factor: 3, maxDelay: 10000 };
      expect(channel.getReconnectDelay(0, options)).toBe(500);   // 500 * 3^0 = 500
      expect(channel.getReconnectDelay(1, options)).toBe(1500);  // 500 * 3^1 = 1500
      expect(channel.getReconnectDelay(2, options)).toBe(4500);  // 500 * 3^2 = 4500
      expect(channel.getReconnectDelay(10, options)).toBe(10000); // capped at maxDelay
    });
  });

  describe('activation modes', () => {
    it('should dispatch all messages in always mode', async () => {
      const channel = new TestChannel();
      const handler = vi.fn();
      channel.onMessage(handler);
      channel.setActivationMode('always');

      const msg: UnifiedMessage = {
        id: '1', source: { channel: 'test', userId: 'u1', sessionId: 's1' },
        content: { type: 'text', text: 'hello' }, timestamp: Date.now(),
      };
      await channel.handleIncoming(msg, { isMention: false, isReply: false });
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should filter non-mention messages in mention mode', async () => {
      const channel = new TestChannel();
      const handler = vi.fn();
      channel.onMessage(handler);
      channel.setActivationMode('mention');

      const msg: UnifiedMessage = {
        id: '1', source: { channel: 'test', userId: 'u1', sessionId: 's1' },
        content: { type: 'text', text: 'hello' }, timestamp: Date.now(),
      };
      await channel.handleIncoming(msg, { isMention: false, isReply: false });
      expect(handler).not.toHaveBeenCalled();

      await channel.handleIncoming(msg, { isMention: true, isReply: false });
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should filter non-reply messages in reply mode', async () => {
      const channel = new TestChannel();
      const handler = vi.fn();
      channel.onMessage(handler);
      channel.setActivationMode('reply');

      const msg: UnifiedMessage = {
        id: '1', source: { channel: 'test', userId: 'u1', sessionId: 's1' },
        content: { type: 'text', text: 'hello' }, timestamp: Date.now(),
      };
      await channel.handleIncoming(msg, { isMention: false, isReply: false });
      expect(handler).not.toHaveBeenCalled();

      await channel.handleIncoming(msg, { isMention: false, isReply: true });
      expect(handler).toHaveBeenCalledOnce();
    });
  });
});
