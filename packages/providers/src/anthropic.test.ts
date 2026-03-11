import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider } from './anthropic.js';
import type { StreamChunk } from './base.js';

function sseStream(events: Array<{ event: string; data: string }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = events.map((e) => `event: ${e.event}\ndata: ${e.data}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
}

describe('AnthropicProvider', () => {
  const provider = new AnthropicProvider({ apiKey: 'test-key' });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('chat (non-streaming)', () => {
    it('should send request and parse response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg-1', type: 'message', role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-sonnet-4-5', stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      }));

      const result = await provider.chat({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(result.content).toBe('Hello!');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.model).toBe('claude-sonnet-4-5');
    });

    it('should throw on non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false, status: 500,
        text: () => Promise.resolve('Internal error'),
      }));

      await expect(provider.chat({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'hi' }],
      })).rejects.toThrow('Anthropic API error (500)');
    });

    it('should handle tool use response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'msg-2', type: 'message', role: 'assistant',
          content: [
            { type: 'text', text: 'Let me check.' },
            { type: 'tool_use', id: 'tu-1', name: 'calculator', input: { expr: '2+2' } },
          ],
          model: 'claude-sonnet-4-5', stop_reason: 'tool_use',
          usage: { input_tokens: 20, output_tokens: 15 },
        }),
      }));

      const result = await provider.chat({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'what is 2+2' }],
      });

      expect(result.content).toBe('Let me check.');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('calculator');
      expect(result.stopReason).toBe('tool_use');
    });
  });

  describe('chatStream', () => {
    it('should yield text_delta chunks from SSE stream', async () => {
      const events = [
        { event: 'message_start', data: JSON.stringify({ type: 'message_start', message: { id: 'msg-1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } } }) },
        { event: 'content_block_start', data: JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) },
        { event: 'content_block_delta', data: JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } }) },
        { event: 'content_block_delta', data: JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } }) },
        { event: 'content_block_stop', data: JSON.stringify({ type: 'content_block_stop', index: 0 }) },
        { event: 'message_delta', data: JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } }) },
        { event: 'message_stop', data: JSON.stringify({ type: 'message_stop' }) },
      ];

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: sseStream(events),
      }));

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.chatStream({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'hi' }],
      })) {
        chunks.push(chunk);
      }

      const textChunks = chunks.filter((c) => c.type === 'text_delta');
      expect(textChunks).toHaveLength(2);
      expect(textChunks[0].text).toBe('Hello');
      expect(textChunks[1].text).toBe(' world');

      const doneChunks = chunks.filter((c) => c.type === 'done');
      expect(doneChunks).toHaveLength(1);
      expect(doneChunks[0].usage).toBeDefined();
    });

    it('should yield tool_start and tool_end for tool use streaming', async () => {
      const events = [
        { event: 'message_start', data: JSON.stringify({ type: 'message_start', message: { id: 'msg-2', model: 'claude-sonnet-4-5', usage: { input_tokens: 15, output_tokens: 0 } } }) },
        { event: 'content_block_start', data: JSON.stringify({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu-1', name: 'calculator' } }) },
        { event: 'content_block_delta', data: JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"expr":' } }) },
        { event: 'content_block_delta', data: JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"2+2"}' } }) },
        { event: 'content_block_stop', data: JSON.stringify({ type: 'content_block_stop', index: 0 }) },
        { event: 'message_delta', data: JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 10 } }) },
        { event: 'message_stop', data: JSON.stringify({ type: 'message_stop' }) },
      ];

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: sseStream(events),
      }));

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.chatStream({
        model: 'claude-sonnet-4-5',
        messages: [{ role: 'user', content: 'calc 2+2' }],
      })) {
        chunks.push(chunk);
      }

      const toolStarts = chunks.filter((c) => c.type === 'tool_start');
      expect(toolStarts).toHaveLength(1);
      expect(toolStarts[0].toolCall?.name).toBe('calculator');

      const toolEnds = chunks.filter((c) => c.type === 'tool_end');
      expect(toolEnds).toHaveLength(1);
    });

    it('should throw on non-OK streaming response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false, status: 401,
        text: () => Promise.resolve('Unauthorized'),
      }));

      await expect(async () => {
        for await (const _ of provider.chatStream({
          model: 'claude-sonnet-4-5',
          messages: [{ role: 'user', content: 'hi' }],
        })) { /* empty */ }
      }).rejects.toThrow('Anthropic API error (401)');
    });
  });

  describe('validateApiKey', () => {
    it('should return true for non-401 responses', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }));
      expect(await provider.validateApiKey()).toBe(true);
    });

    it('should return false for 401', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401 }));
      expect(await provider.validateApiKey()).toBe(false);
    });

    it('should return false on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
      expect(await provider.validateApiKey()).toBe(false);
    });
  });
});
