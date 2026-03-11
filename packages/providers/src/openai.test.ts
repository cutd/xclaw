import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from './openai.js';
import type { StreamChunk } from './base.js';

function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = events.map((e) => `data: ${e}\n\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe('OpenAIProvider', () => {
  const provider = new OpenAIProvider({ apiKey: 'test-key' });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('manifest', () => {
    it('should have name openai and expected models', () => {
      expect(provider.name).toBe('openai');
      expect(provider.models).toContain('gpt-4o');
      expect(provider.models).toContain('gpt-4o-mini');
    });
  });

  describe('chat (non-streaming)', () => {
    it('should send request and parse response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-1',
          choices: [{
            message: { role: 'assistant', content: 'Hi there!' },
            finish_reason: 'stop',
          }],
          model: 'gpt-4o',
          usage: { prompt_tokens: 8, completion_tokens: 4 },
        }),
      }));

      const result = await provider.chat({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hello' }],
      });

      expect(result.content).toBe('Hi there!');
      expect(result.model).toBe('gpt-4o');
      expect(result.usage.inputTokens).toBe(8);
      expect(result.usage.outputTokens).toBe(4);
    });

    it('should convert system prompt to system message', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-2',
          choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
          model: 'gpt-4o',
          usage: { prompt_tokens: 10, completion_tokens: 1 },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await provider.chat({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        systemPrompt: 'You are helpful.',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    });

    it('should handle tool calls in response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-3',
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call-1',
                type: 'function',
                function: { name: 'calculator', arguments: '{"expr":"2+2"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
          model: 'gpt-4o',
          usage: { prompt_tokens: 15, completion_tokens: 10 },
        }),
      }));

      const result = await provider.chat({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'what is 2+2' }],
        tools: [{ name: 'calculator', description: 'math', inputSchema: { type: 'object' } }],
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('calculator');
      expect(result.toolCalls![0].args).toEqual({ expr: '2+2' });
    });

    it('should throw on non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false, status: 429,
        text: () => Promise.resolve('Rate limited'),
      }));

      await expect(provider.chat({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
      })).rejects.toThrow('OpenAI API error (429)');
    });
  });

  describe('chatStream', () => {
    it('should yield text_delta chunks from SSE', async () => {
      const events = [
        JSON.stringify({ choices: [{ delta: { role: 'assistant', content: '' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }),
        JSON.stringify({ choices: [{ delta: { content: ' world' } }] }),
        JSON.stringify({ choices: [{ delta: {} }], usage: { prompt_tokens: 5, completion_tokens: 3 } }),
        '[DONE]',
      ];

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        body: sseStream(events),
      }));

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.chatStream({
        model: 'gpt-4o',
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
    });

    it('should throw on non-OK streaming response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false, status: 401,
        text: () => Promise.resolve('Invalid API key'),
      }));

      await expect(async () => {
        for await (const _ of provider.chatStream({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'hi' }],
        })) { /* empty */ }
      }).rejects.toThrow('OpenAI API error (401)');
    });
  });

  describe('validateApiKey', () => {
    it('should return true for non-401 response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, ok: true, json: () => Promise.resolve({ data: [] }) }));
      expect(await provider.validateApiKey()).toBe(true);
    });

    it('should return false for 401', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false }));
      expect(await provider.validateApiKey()).toBe(false);
    });
  });
});
