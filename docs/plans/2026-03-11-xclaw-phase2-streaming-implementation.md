# Phase 2: Streaming, Presence & Config Hot-Reload Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add provider-level LLM streaming (Anthropic + OpenAI), incremental text streaming through agents, gateway stream forwarding, per-channel presence tracking, and config file hot-reload.

**Architecture:** Streaming flows bottom-up: Provider `chatStream()` yields `StreamChunk` via `AsyncIterable` → Agent iterates chunks, emitting `StreamBlock` via `StreamCallback` → Pipeline passes callback through → Gateway bridges to WebSocket `chat.stream_*` messages. Presence and config watcher are standalone modules in the gateway and runtime.

**Tech Stack:** TypeScript, Node.js 22+, vitest, native `fetch` with SSE parsing, `fs.watch`, pnpm workspaces

---

### Task 1: Provider Streaming Types & Anthropic chatStream

Add `StreamChunk` type and optional `chatStream()` to `LLMProvider` interface. Implement SSE streaming in `AnthropicProvider`.

**Files:**
- Modify: `packages/providers/src/base.ts`
- Modify: `packages/providers/src/anthropic.ts`
- Modify: `packages/providers/src/index.ts`
- Create: `packages/providers/src/anthropic.test.ts`

**Step 1: Write the failing tests**

Create `packages/providers/src/anthropic.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider } from './anthropic.js';
import type { StreamChunk } from './base.js';

// Helper: build an SSE text stream from events
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
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-sonnet-4-5',
          stop_reason: 'end_turn',
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
        ok: false,
        status: 500,
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
          id: 'msg-2',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me check.' },
            { type: 'tool_use', id: 'tu-1', name: 'calculator', input: { expr: '2+2' } },
          ],
          model: 'claude-sonnet-4-5',
          stop_reason: 'tool_use',
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
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      }));

      await expect(async () => {
        for await (const _ of provider.chatStream({
          model: 'claude-sonnet-4-5',
          messages: [{ role: 'user', content: 'hi' }],
        })) {
          // should not reach here
        }
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
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/providers && npx vitest run src/anthropic.test.ts`
Expected: FAIL — `StreamChunk` type doesn't exist, `chatStream` method doesn't exist

**Step 3: Add StreamChunk type and chatStream to LLMProvider interface**

In `packages/providers/src/base.ts`, add after the `ChatResponse` interface (before the Provider interface section):

```typescript
// ── Streaming types ──────────────────────────────────────────────────

export interface StreamChunk {
  type: 'text_delta' | 'tool_start' | 'tool_delta' | 'tool_end' | 'done';
  text?: string;
  toolCall?: Partial<ToolCall>;
  usage?: TokenUsage;
}
```

In the `LLMProvider` interface, add after `chat()`:

```typescript
  /** Stream a chat response as incremental chunks. Optional — not all providers support streaming. */
  chatStream?(request: ChatRequest): AsyncIterable<StreamChunk>;
```

In `packages/providers/src/index.ts`, add `StreamChunk` to the exports:

```typescript
export {
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type LLMProvider,
  type StreamChunk,
  type TokenUsage,
  type ToolCall,
  type ToolSchema,
  ProviderRegistry,
} from './base.js';
```

**Step 4: Implement chatStream in AnthropicProvider**

In `packages/providers/src/anthropic.ts`, add the `stream: boolean` field to `AnthropicRequestBody`:

```typescript
interface AnthropicRequestBody {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string;
  temperature?: number;
  tools?: AnthropicToolDef[];
  stream?: boolean;
}
```

Add import for `StreamChunk`:

```typescript
import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ToolCall,
  StreamChunk,
} from './base.js';
```

Add two methods to `AnthropicProvider`:

```typescript
  // ── LLMProvider.chatStream ───────────────────────────────────────

  async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const body = this.buildRequestBody(request);
    body.stream = true;

    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${text}`);
    }

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of this.parseSSEStream(res.body!)) {
      switch (event.type) {
        case 'message_start':
          inputTokens = event.message?.usage?.input_tokens ?? 0;
          break;

        case 'content_block_start':
          if (event.content_block?.type === 'tool_use') {
            yield {
              type: 'tool_start',
              toolCall: { name: event.content_block.name, id: event.content_block.id },
            };
          }
          break;

        case 'content_block_delta':
          if (event.delta?.type === 'text_delta') {
            yield { type: 'text_delta', text: event.delta.text };
          } else if (event.delta?.type === 'input_json_delta') {
            yield { type: 'tool_delta', text: event.delta.partial_json };
          }
          break;

        case 'content_block_stop':
          // Check if the previous block was a tool_use by checking if we yielded tool_start
          yield { type: 'tool_end' };
          break;

        case 'message_delta':
          outputTokens = event.usage?.output_tokens ?? outputTokens;
          break;

        case 'message_stop':
          yield { type: 'done', usage: { inputTokens, outputTokens } };
          break;
      }
    }
  }

  private async *parseSSEStream(
    body: ReadableStream<Uint8Array>,
  ): AsyncIterable<Record<string, any>> {
    const decoder = new TextDecoder();
    const reader = body.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop()!; // keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            if (jsonStr === '[DONE]') return;
            try {
              yield JSON.parse(jsonStr);
            } catch {
              // skip malformed JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
```

**Note:** The `content_block_stop` yields `tool_end` unconditionally, which means it also fires after text blocks. To keep it simple, the agent layer will only consume `tool_end` when it's tracking an active tool. This avoids needing to track block types inside the provider.

**Step 5: Run tests to verify they pass**

Run: `cd packages/providers && npx vitest run src/anthropic.test.ts`
Expected: PASS — all 8 tests

**Step 6: Run full provider test suite**

Run: `cd packages/providers && npx vitest run`
Expected: All existing tests still pass

**Step 7: Commit**

```bash
git add packages/providers/src/base.ts packages/providers/src/anthropic.ts packages/providers/src/index.ts packages/providers/src/anthropic.test.ts
git commit -m "feat: add StreamChunk type and Anthropic chatStream SSE streaming"
```

---

### Task 2: OpenAI Provider

Create a new `OpenAIProvider` with both `chat()` and `chatStream()`.

**Files:**
- Create: `packages/providers/src/openai.ts`
- Create: `packages/providers/src/openai.test.ts`
- Modify: `packages/providers/src/index.ts`

**Step 1: Write the failing tests**

Create `packages/providers/src/openai.test.ts`:

```typescript
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
        ok: false,
        status: 429,
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
        ok: false,
        status: 401,
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
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/providers && npx vitest run src/openai.test.ts`
Expected: FAIL — module `./openai.js` doesn't exist

**Step 3: Implement OpenAIProvider**

Create `packages/providers/src/openai.ts`:

```typescript
/**
 * OpenAI LLM provider.
 *
 * Uses the OpenAI Chat Completions API with native fetch (Node 22+).
 */

import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  ToolCall,
} from './base.js';

// ── Configuration ───────────────────────────────────────────────────

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
}

// ── OpenAI API shapes ───────────────────────────────────────────────

interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAITool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface OpenAIRequestBody {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  tools?: OpenAITool[];
  stream?: boolean;
  stream_options?: { include_usage: boolean };
}

interface OpenAIResponseBody {
  id: string;
  choices: Array<{
    message: OpenAIMessage;
    finish_reason: string;
  }>;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number };
}

// ── Provider ────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.openai.com';
const DEFAULT_MAX_TOKENS = 4096;

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly models = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'] as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: OpenAIConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body = this.buildRequestBody(request);

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as OpenAIResponseBody;
    return this.parseResponse(data);
  }

  async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk> {
    const body = this.buildRequestBody(request);
    body.stream = true;
    body.stream_options = { include_usage: true };

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${text}`);
    }

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const line of this.parseSSELines(res.body!)) {
      if (line === '[DONE]') {
        yield { type: 'done', usage: { inputTokens, outputTokens } };
        return;
      }

      let data: any;
      try {
        data = JSON.parse(line);
      } catch {
        continue;
      }

      // Collect usage from the final chunk
      if (data.usage) {
        inputTokens = data.usage.prompt_tokens ?? inputTokens;
        outputTokens = data.usage.completion_tokens ?? outputTokens;
      }

      const choice = data.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (!delta) continue;

      if (delta.content) {
        yield { type: 'text_delta', text: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.function?.name) {
            yield { type: 'tool_start', toolCall: { name: tc.function.name, id: tc.id } };
          }
          if (tc.function?.arguments) {
            yield { type: 'tool_delta', text: tc.function.arguments };
          }
        }
      }
    }

    // If stream ended without [DONE], still emit done
    yield { type: 'done', usage: { inputTokens, outputTokens } };
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return res.status !== 401;
    } catch {
      return false;
    }
  }

  private buildRequestBody(request: ChatRequest): OpenAIRequestBody {
    const messages: OpenAIMessage[] = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const body: OpenAIRequestBody = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
    }

    return body;
  }

  private parseResponse(data: OpenAIResponseBody): ChatResponse {
    const choice = data.choices[0];
    const toolCalls: ToolCall[] = [];

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments);
        } catch { /* empty */ }
        toolCalls.push({ name: tc.function.name, args, id: tc.id });
      }
    }

    const response: ChatResponse = {
      content: choice.message.content ?? '',
      model: data.model,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      },
    };

    if (toolCalls.length > 0) {
      response.toolCalls = toolCalls;
    }
    if (choice.finish_reason) {
      response.stopReason = choice.finish_reason;
    }

    return response;
  }

  private async *parseSSELines(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
    const decoder = new TextDecoder();
    const reader = body.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop()!;

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            yield trimmed.slice(6);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
```

**Step 4: Update exports**

In `packages/providers/src/index.ts`, add:

```typescript
export { type OpenAIConfig, OpenAIProvider } from './openai.js';
```

**Step 5: Run tests to verify they pass**

Run: `cd packages/providers && npx vitest run src/openai.test.ts`
Expected: PASS — all 8 tests

**Step 6: Run full provider test suite**

Run: `cd packages/providers && npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add packages/providers/src/openai.ts packages/providers/src/openai.test.ts packages/providers/src/index.ts
git commit -m "feat: add OpenAI provider with chat and streaming support"
```

---

### Task 3: Agent Streaming Integration

Modify agents to use `chatStream()` when available, emitting incremental text chunks instead of full text at the end.

**Files:**
- Modify: `packages/core/src/agent/lightweight.ts`
- Modify: `packages/core/src/agent/standard.ts`
- Modify: `packages/core/src/agent/expert.ts`
- Modify: `packages/core/src/agent/lightweight.test.ts`
- Modify: `packages/core/src/agent/standard.test.ts`

**Step 1: Write the new streaming tests**

Add to `packages/core/src/agent/lightweight.test.ts`:

```typescript
  it('should stream text incrementally when provider has chatStream', async () => {
    async function* mockStream() {
      yield { type: 'text_delta' as const, text: 'Hello' };
      yield { type: 'text_delta' as const, text: ' world' };
      yield { type: 'done' as const, usage: { inputTokens: 10, outputTokens: 5 } };
    }

    const provider = {
      ...mockProvider({ content: 'fallback' }),
      chatStream: vi.fn().mockReturnValue(mockStream()),
    };
    const agent = new LightweightAgent(provider);
    const streamBlocks: any[] = [];
    const onStream = vi.fn((block: any) => streamBlocks.push(block));

    const ctx: AgentContext = {
      sessionId: 'sess-1', userId: 'user-1', message: 'hi',
      tier: 'trivial', model: 'mock-model', maxTokens: 200,
      conversationHistory: [], tools: [],
    };

    const result = await agent.run(ctx, onStream);

    // Should have emitted incremental text blocks, NOT one big block at the end
    const textBlocks = streamBlocks.filter((b) => b.type === 'text');
    expect(textBlocks).toHaveLength(2);
    expect(textBlocks[0].content).toBe('Hello');
    expect(textBlocks[1].content).toBe(' world');

    // Should have emitted done
    expect(streamBlocks.some((b) => b.type === 'done')).toBe(true);

    // Result content should be accumulated
    expect(result.content).toBe('Hello world');
    expect(result.usage.inputTokens).toBe(10);
  });

  it('should fall back to chat() when chatStream is not available', async () => {
    const provider = mockProvider({ content: 'No stream' });
    const agent = new LightweightAgent(provider);
    const onStream = vi.fn();

    const ctx: AgentContext = {
      sessionId: 'sess-1', userId: 'user-1', message: 'hi',
      tier: 'trivial', model: 'mock-model', maxTokens: 200,
      conversationHistory: [], tools: [],
    };

    const result = await agent.run(ctx, onStream);
    expect(result.content).toBe('No stream');
    // Still emits text + done (the old way)
    expect(onStream).toHaveBeenCalledWith(expect.objectContaining({ type: 'text', content: 'No stream' }));
    expect(onStream).toHaveBeenCalledWith(expect.objectContaining({ type: 'done' }));
  });
```

Add to `packages/core/src/agent/standard.test.ts`:

```typescript
  it('should stream text incrementally when provider has chatStream', async () => {
    async function* mockStream() {
      yield { type: 'text_delta' as const, text: 'Streamed' };
      yield { type: 'text_delta' as const, text: ' response' };
      yield { type: 'done' as const, usage: { inputTokens: 12, outputTokens: 8 } };
    }

    const provider = {
      ...mockProvider([{ content: 'fallback' }]),
      chatStream: vi.fn().mockReturnValue(mockStream()),
    };
    const toolExecutor = vi.fn();
    const agent = new StandardAgent(provider, toolExecutor);
    const streamBlocks: any[] = [];
    const onStream = vi.fn((block: any) => streamBlocks.push(block));

    const ctx: AgentContext = {
      sessionId: 's1', userId: 'u1', message: 'test',
      tier: 'standard', model: 'mock-model', maxTokens: 4000,
      conversationHistory: [], tools: [],
    };

    const result = await agent.run(ctx, onStream);

    const textBlocks = streamBlocks.filter((b) => b.type === 'text');
    expect(textBlocks).toHaveLength(2);
    expect(textBlocks[0].content).toBe('Streamed');
    expect(result.content).toBe('Streamed response');
  });

  it('should handle streaming with tool calls', async () => {
    let callCount = 0;
    function makeStreamWithTools() {
      return (async function* () {
        yield { type: 'tool_start' as const, toolCall: { name: 'shell', id: 'tc1' } };
        yield { type: 'tool_delta' as const, text: '{"cmd":"ls"}' };
        yield { type: 'tool_end' as const };
        yield { type: 'done' as const, usage: { inputTokens: 15, outputTokens: 10 } };
      })();
    }
    function makeStreamFinal() {
      return (async function* () {
        yield { type: 'text_delta' as const, text: 'Done!' };
        yield { type: 'done' as const, usage: { inputTokens: 20, outputTokens: 5 } };
      })();
    }

    const provider = {
      ...mockProvider([{ content: 'fallback' }]),
      chatStream: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return makeStreamWithTools();
        return makeStreamFinal();
      }),
    };
    const toolExecutor = vi.fn().mockResolvedValue('file1.txt');
    const agent = new StandardAgent(provider, toolExecutor);
    const streamBlocks: any[] = [];
    const onStream = vi.fn((block: any) => streamBlocks.push(block));

    const ctx: AgentContext = {
      sessionId: 's1', userId: 'u1', message: 'list files',
      tier: 'standard', model: 'mock-model', maxTokens: 4000,
      conversationHistory: [],
      tools: [{ name: 'shell', description: 'run', inputSchema: {} }],
    };

    const result = await agent.run(ctx, onStream);

    expect(toolExecutor).toHaveBeenCalledWith('shell', { cmd: 'ls' });
    expect(result.content).toBe('Done!');
    expect(streamBlocks.some((b) => b.type === 'tool_start')).toBe(true);
    expect(streamBlocks.some((b) => b.type === 'tool_result')).toBe(true);
  });
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/agent/lightweight.test.ts src/agent/standard.test.ts`
Expected: FAIL — agents don't use `chatStream` yet

**Step 3: Update LLMProviderLike interfaces**

In `packages/core/src/agent/lightweight.ts`, extend `LLMProviderLike`:

```typescript
interface StreamChunkLike {
  type: 'text_delta' | 'tool_start' | 'tool_delta' | 'tool_end' | 'done';
  text?: string;
  toolCall?: { name?: string; id?: string };
  usage?: { inputTokens: number; outputTokens: number };
}

interface LLMProviderLike {
  chat(request: {
    model: string;
    messages: ChatMessage[];
    maxTokens?: number;
    systemPrompt?: string;
  }): Promise<{
    content: string;
    model: string;
    usage: { inputTokens: number; outputTokens: number };
    stopReason?: string;
  }>;
  chatStream?(request: {
    model: string;
    messages: ChatMessage[];
    maxTokens?: number;
    systemPrompt?: string;
  }): AsyncIterable<StreamChunkLike>;
}
```

**Step 4: Update LightweightAgent.run()**

Replace the `run` method in `packages/core/src/agent/lightweight.ts`:

```typescript
  async run(context: AgentContext, onStream?: StreamCallback): Promise<AgentResult> {
    const messages: ChatMessage[] = [
      ...context.conversationHistory.map((t) => ({
        role: t.role as ChatMessage['role'],
        content: t.content,
      })),
      { role: 'user' as const, content: context.message },
    ];

    const request = {
      model: context.model,
      messages,
      maxTokens: context.maxTokens,
      systemPrompt: context.systemPrompt,
    };

    // Streaming path
    if (this.provider.chatStream && onStream) {
      let content = '';
      let model = context.model;
      let usage = { inputTokens: 0, outputTokens: 0 };

      for await (const chunk of this.provider.chatStream(request)) {
        switch (chunk.type) {
          case 'text_delta':
            if (chunk.text) {
              content += chunk.text;
              onStream({ type: 'text', content: chunk.text });
            }
            break;
          case 'done':
            if (chunk.usage) {
              usage = chunk.usage;
            }
            onStream({ type: 'done' });
            break;
        }
      }

      return { content, model, usage };
    }

    // Non-streaming fallback
    const response = await this.provider.chat(request);

    if (onStream) {
      onStream({ type: 'text', content: response.content });
      onStream({ type: 'done' });
    }

    return {
      content: response.content,
      model: response.model,
      usage: response.usage,
      stopReason: response.stopReason,
    };
  }
```

**Step 5: Update StandardAgent and ExpertAgent LLMProviderLike**

In `packages/core/src/agent/standard.ts`, add `StreamChunkLike` and extend `LLMProviderLike`:

```typescript
interface StreamChunkLike {
  type: 'text_delta' | 'tool_start' | 'tool_delta' | 'tool_end' | 'done';
  text?: string;
  toolCall?: { name?: string; id?: string };
  usage?: { inputTokens: number; outputTokens: number };
}

interface LLMProviderLike {
  chat(request: {
    model: string;
    messages: ChatMessage[];
    maxTokens?: number;
    systemPrompt?: string;
    tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  }): Promise<{
    content: string;
    model: string;
    usage: { inputTokens: number; outputTokens: number };
    toolCalls?: ToolCall[];
    stopReason?: string;
  }>;
  chatStream?(request: {
    model: string;
    messages: ChatMessage[];
    maxTokens?: number;
    systemPrompt?: string;
    tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  }): AsyncIterable<StreamChunkLike>;
}
```

**Step 6: Update StandardAgent.run() with streaming path**

Replace the `run` method in `packages/core/src/agent/standard.ts`. The key logic: if `chatStream` is available and `onStream` is provided, use streaming. For each LLM call (initial + after tool results), use `chatStream`. Parse the stream to collect text, tool calls, and usage. Execute tools as before. Emit stream blocks incrementally.

```typescript
  async run(context: AgentContext, onStream?: StreamCallback): Promise<AgentResult> {
    const messages: ChatMessage[] = [
      ...context.conversationHistory.map((t) => ({
        role: t.role as ChatMessage['role'],
        content: t.content,
      })),
      { role: 'user' as const, content: context.message },
    ];

    const allToolExecutions: ToolExecution[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const useStreaming = !!(this.provider.chatStream && onStream);

    const callLLM = async () => {
      const request = {
        model: context.model,
        messages,
        maxTokens: context.maxTokens,
        systemPrompt: context.systemPrompt,
        tools: context.tools,
      };

      if (useStreaming) {
        return this.streamLLMCall(request, onStream!);
      }
      return this.provider.chat(request);
    };

    let response = await callLLM();
    totalInputTokens += response.usage.inputTokens;
    totalOutputTokens += response.usage.outputTokens;

    for (let round = 0; round < this.maxToolRounds; round++) {
      if (!response.toolCalls || response.toolCalls.length === 0) {
        break;
      }

      messages.push({ role: 'assistant', content: response.content });

      for (const toolCall of response.toolCalls) {
        if (onStream) {
          onStream({ type: 'tool_start', toolName: toolCall.name, toolArgs: toolCall.args });
        }

        const startTime = Date.now();
        let result: unknown;
        let error: string | undefined;

        try {
          result = await this.toolExecutor(toolCall.name, toolCall.args);
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          result = `Error: ${error}`;
        }

        const durationMs = Date.now() - startTime;
        allToolExecutions.push({ toolName: toolCall.name, args: toolCall.args, result, durationMs, error });

        if (onStream) {
          onStream({ type: 'tool_result', toolName: toolCall.name, toolResult: result });
        }

        messages.push({
          role: 'user',
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }

      response = await callLLM();
      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;
    }

    // For non-streaming path, emit text + done at end (existing behavior)
    if (!useStreaming && onStream) {
      onStream({ type: 'text', content: response.content });
      onStream({ type: 'done' });
    }

    // For streaming path, emit done at the very end (after all tool rounds)
    if (useStreaming && (!response.toolCalls || response.toolCalls.length === 0)) {
      onStream!({ type: 'done' });
    }

    return {
      content: response.content,
      model: response.model,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      toolExecutions: allToolExecutions.length > 0 ? allToolExecutions : undefined,
      stopReason: response.stopReason,
    };
  }

  private async streamLLMCall(
    request: Parameters<LLMProviderLike['chat']>[0],
    onStream: StreamCallback,
  ): Promise<{
    content: string;
    model: string;
    usage: { inputTokens: number; outputTokens: number };
    toolCalls?: ToolCall[];
    stopReason?: string;
  }> {
    let content = '';
    let usage = { inputTokens: 0, outputTokens: 0 };
    const toolCalls: ToolCall[] = [];
    let currentToolName = '';
    let currentToolId = '';
    let currentToolJson = '';

    for await (const chunk of this.provider.chatStream!(request)) {
      switch (chunk.type) {
        case 'text_delta':
          if (chunk.text) {
            content += chunk.text;
            onStream({ type: 'text', content: chunk.text });
          }
          break;
        case 'tool_start':
          currentToolName = chunk.toolCall?.name ?? '';
          currentToolId = chunk.toolCall?.id ?? '';
          currentToolJson = '';
          break;
        case 'tool_delta':
          currentToolJson += chunk.text ?? '';
          break;
        case 'tool_end':
          if (currentToolName) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(currentToolJson); } catch { /* empty */ }
            toolCalls.push({ name: currentToolName, args, id: currentToolId });
            currentToolName = '';
          }
          break;
        case 'done':
          if (chunk.usage) usage = chunk.usage;
          break;
      }
    }

    return {
      content,
      model: request.model,
      usage,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
```

**Step 7: Apply the same changes to ExpertAgent**

In `packages/core/src/agent/expert.ts`, add the same `StreamChunkLike` interface, extend `LLMProviderLike` with `chatStream?`, and add the same `streamLLMCall` private method. Update `run()` with the same pattern as StandardAgent (use `callLLM` closure that picks streaming vs non-streaming). The tool loop and delegation logic stay the same.

**Step 8: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/agent/`
Expected: All agent tests pass (existing + new streaming tests)

**Step 9: Run full core test suite**

Run: `cd packages/core && npx vitest run`
Expected: All tests pass

**Step 10: Commit**

```bash
git add packages/core/src/agent/lightweight.ts packages/core/src/agent/standard.ts packages/core/src/agent/expert.ts packages/core/src/agent/lightweight.test.ts packages/core/src/agent/standard.test.ts
git commit -m "feat: add incremental streaming to all agent types with chatStream fallback"
```

---

### Task 4: Gateway Stream Bridge

Wire `StreamCallback` from the pipeline to WebSocket messages in the gateway.

**Files:**
- Modify: `packages/core/src/runtime/runtime.ts`
- Modify: `packages/core/src/gateway/server.ts`
- Create: `packages/core/src/gateway/streamBridge.test.ts`

**Step 1: Write the failing tests**

Create `packages/core/src/gateway/streamBridge.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createStreamBridge } from './streamBridge.js';
import type { GatewayMessage } from './types.js';

describe('createStreamBridge', () => {
  it('should send stream_start on first block', () => {
    const sendTo = vi.fn();
    const bridge = createStreamBridge('conn-1', sendTo);

    bridge({ type: 'text', content: 'Hello' });

    // First call should be stream_start, second should be stream_block
    expect(sendTo).toHaveBeenCalledTimes(2);
    const startMsg = sendTo.mock.calls[0][1] as GatewayMessage;
    expect(startMsg.type).toBe('chat.stream_start');

    const blockMsg = sendTo.mock.calls[1][1] as GatewayMessage;
    expect(blockMsg.type).toBe('chat.stream_block');
    expect(blockMsg.payload.content).toBe('Hello');
  });

  it('should send stream_block for text chunks', () => {
    const sendTo = vi.fn();
    const bridge = createStreamBridge('conn-1', sendTo);

    bridge({ type: 'text', content: 'Hello' });
    bridge({ type: 'text', content: ' world' });

    // 1 stream_start + 2 stream_blocks
    expect(sendTo).toHaveBeenCalledTimes(3);
  });

  it('should send stream_block for tool_start and tool_result', () => {
    const sendTo = vi.fn();
    const bridge = createStreamBridge('conn-1', sendTo);

    bridge({ type: 'tool_start', toolName: 'shell', toolArgs: { cmd: 'ls' } });
    bridge({ type: 'tool_result', toolName: 'shell', toolResult: 'file.txt' });

    // 1 stream_start + 2 stream_blocks
    expect(sendTo).toHaveBeenCalledTimes(3);
    const toolBlock = sendTo.mock.calls[1][1] as GatewayMessage;
    expect(toolBlock.payload.toolName).toBe('shell');
  });

  it('should send stream_end on done', () => {
    const sendTo = vi.fn();
    const bridge = createStreamBridge('conn-1', sendTo);

    bridge({ type: 'text', content: 'Hi' });
    bridge({ type: 'done' });

    const lastCall = sendTo.mock.calls[sendTo.mock.calls.length - 1][1] as GatewayMessage;
    expect(lastCall.type).toBe('chat.stream_end');
  });

  it('should not send stream_start if first block is done', () => {
    const sendTo = vi.fn();
    const bridge = createStreamBridge('conn-1', sendTo);

    bridge({ type: 'done' });

    expect(sendTo).toHaveBeenCalledTimes(1);
    expect((sendTo.mock.calls[0][1] as GatewayMessage).type).toBe('chat.stream_end');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/gateway/streamBridge.test.ts`
Expected: FAIL — module `./streamBridge.js` doesn't exist

**Step 3: Implement the stream bridge**

Create `packages/core/src/gateway/streamBridge.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import type { StreamBlock, StreamCallback } from '../agent/types.js';
import type { GatewayMessage } from './types.js';

export type SendToFn = (connectionId: string, message: GatewayMessage) => void;

export function createStreamBridge(
  connectionId: string,
  sendTo: SendToFn,
): StreamCallback {
  let started = false;

  return (block: StreamBlock) => {
    // Send stream_start before the first non-done block
    if (!started && block.type !== 'done') {
      sendTo(connectionId, {
        type: 'chat.stream_start',
        id: randomUUID(),
        payload: {},
        timestamp: Date.now(),
      });
      started = true;
    }

    if (block.type === 'done') {
      sendTo(connectionId, {
        type: 'chat.stream_end',
        id: randomUUID(),
        payload: {},
        timestamp: Date.now(),
      });
      return;
    }

    const payload: Record<string, unknown> = {};
    if (block.content !== undefined) payload.content = block.content;
    if (block.toolName !== undefined) payload.toolName = block.toolName;
    if (block.toolArgs !== undefined) payload.toolArgs = block.toolArgs;
    if (block.toolResult !== undefined) payload.toolResult = block.toolResult;
    payload.blockType = block.type;

    sendTo(connectionId, {
      type: 'chat.stream_block',
      id: randomUUID(),
      payload,
      timestamp: Date.now(),
    });
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/gateway/streamBridge.test.ts`
Expected: PASS — all 5 tests

**Step 5: Wire the bridge into the runtime**

In `packages/core/src/runtime/runtime.ts`, add the import:

```typescript
import { createStreamBridge } from '../gateway/streamBridge.js';
```

In the `wireChannel` method, update to pass `onStream`:

```typescript
  wireChannel(name: string, channel: any): void {
    if (!this.pipeline) throw new Error('Pipeline not initialized');
    const pipeline = this.pipeline;

    channel.onMessage(async (msg: any) => {
      try {
        const result = await pipeline.process(msg);
        await channel.send({
          targetChannel: name,
          targetUserId: msg.source.userId,
          targetSessionId: msg.source.sessionId,
          content: { type: 'text', text: result.content },
        });
      } catch {
        // Pipeline error -- logged by audit
      }
    });
  }
```

*Note: The stream bridge is used for WebSocket connections, not channel connections. The runtime needs to handle `gateway.message` events and pass the stream bridge. Add this event handler wiring in `start()` after the gateway is created:*

After `await this.gateway.start();`, add:

```typescript
      // Wire gateway messages to pipeline with stream bridge
      this.eventBus.on('gateway.message', async (event: any) => {
        const { connectionId, sessionId, message } = event;
        if (message.type !== 'chat.message') return;
        if (!this.pipeline || !this.gateway) return;

        const onStream = createStreamBridge(connectionId, (connId, msg) => {
          this.gateway!.sendTo(connId, msg);
        });

        try {
          const result = await this.pipeline.process(
            {
              id: message.id,
              source: {
                channel: 'gateway',
                userId: message.payload.userId ?? 'anonymous',
                sessionId: sessionId ?? '',
              },
              content: { type: 'text', text: message.payload.text as string },
              timestamp: message.timestamp,
            },
            onStream,
          );

          // Also send the final chat.response for clients that don't handle streaming
          this.gateway.sendTo(connectionId, {
            type: 'chat.response',
            id: message.id,
            payload: { text: result.content, model: result.model, usage: result.usage },
            timestamp: Date.now(),
          });
        } catch {
          this.gateway.sendTo(connectionId, {
            type: 'error',
            id: message.id,
            payload: { error: 'Pipeline processing failed' },
            timestamp: Date.now(),
          });
        }
      });
```

**Step 6: Run full core test suite**

Run: `cd packages/core && npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add packages/core/src/gateway/streamBridge.ts packages/core/src/gateway/streamBridge.test.ts packages/core/src/runtime/runtime.ts
git commit -m "feat: add gateway stream bridge for WebSocket streaming"
```

---

### Task 5: Presence System

Add per-channel presence tracking to the gateway.

**Files:**
- Create: `packages/core/src/gateway/presence.ts`
- Create: `packages/core/src/gateway/presence.test.ts`
- Modify: `packages/core/src/gateway/server.ts`

**Step 1: Write the failing tests**

Create `packages/core/src/gateway/presence.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PresenceTracker } from './presence.js';

describe('PresenceTracker', () => {
  it('should track a join', () => {
    const tracker = new PresenceTracker();
    tracker.join('conn-1', 'user-1', 'web');

    const all = tracker.listAll();
    expect(all).toHaveLength(1);
    expect(all[0].userId).toBe('user-1');
    expect(all[0].channel).toBe('web');
    expect(all[0].connectionId).toBe('conn-1');
    expect(all[0].joinedAt).toBeGreaterThan(0);
  });

  it('should track and remove a leave', () => {
    const tracker = new PresenceTracker();
    tracker.join('conn-1', 'user-1', 'web');

    const entry = tracker.leave('conn-1');
    expect(entry).toBeDefined();
    expect(entry!.userId).toBe('user-1');
    expect(tracker.listAll()).toHaveLength(0);
  });

  it('should return undefined for unknown leave', () => {
    const tracker = new PresenceTracker();
    expect(tracker.leave('conn-unknown')).toBeUndefined();
  });

  it('should list by channel', () => {
    const tracker = new PresenceTracker();
    tracker.join('conn-1', 'user-1', 'web');
    tracker.join('conn-2', 'user-2', 'cli');
    tracker.join('conn-3', 'user-3', 'web');

    const webEntries = tracker.listByChannel('web');
    expect(webEntries).toHaveLength(2);
    expect(webEntries.map((e) => e.userId)).toContain('user-1');
    expect(webEntries.map((e) => e.userId)).toContain('user-3');

    const cliEntries = tracker.listByChannel('cli');
    expect(cliEntries).toHaveLength(1);
  });

  it('should not have cross-channel leakage', () => {
    const tracker = new PresenceTracker();
    tracker.join('conn-1', 'user-1', 'web');

    expect(tracker.listByChannel('cli')).toHaveLength(0);
  });

  it('should handle duplicate join (same connectionId overwrites)', () => {
    const tracker = new PresenceTracker();
    tracker.join('conn-1', 'user-1', 'web');
    tracker.join('conn-1', 'user-1', 'cli'); // re-join on different channel

    expect(tracker.listAll()).toHaveLength(1);
    expect(tracker.listByChannel('cli')).toHaveLength(1);
    expect(tracker.listByChannel('web')).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/gateway/presence.test.ts`
Expected: FAIL — module `./presence.js` doesn't exist

**Step 3: Implement PresenceTracker**

Create `packages/core/src/gateway/presence.ts`:

```typescript
export interface PresenceEntry {
  userId: string;
  channel: string;
  connectionId: string;
  joinedAt: number;
}

export class PresenceTracker {
  private entries = new Map<string, PresenceEntry>();

  join(connectionId: string, userId: string, channel: string): void {
    this.entries.set(connectionId, {
      userId,
      channel,
      connectionId,
      joinedAt: Date.now(),
    });
  }

  leave(connectionId: string): PresenceEntry | undefined {
    const entry = this.entries.get(connectionId);
    if (entry) {
      this.entries.delete(connectionId);
    }
    return entry;
  }

  listByChannel(channel: string): PresenceEntry[] {
    return [...this.entries.values()].filter((e) => e.channel === channel);
  }

  listAll(): PresenceEntry[] {
    return [...this.entries.values()];
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/gateway/presence.test.ts`
Expected: PASS — all 6 tests

**Step 5: Integrate PresenceTracker into GatewayServer**

In `packages/core/src/gateway/server.ts`:

Add import:
```typescript
import { PresenceTracker } from './presence.js';
```

Add to `GatewayServer`:
```typescript
  readonly presence = new PresenceTracker();
```

Add a `broadcastToChannel` method:
```typescript
  broadcastToChannel(channel: string, message: GatewayMessage, excludeConnectionId?: string): void {
    const members = this.presence.listByChannel(channel);
    for (const member of members) {
      if (member.connectionId === excludeConnectionId) continue;
      this.sendTo(member.connectionId, message);
    }
  }
```

In `handleMessage`, add the `session.create` case to join presence and broadcast. After the existing `client.connection.sessionId = session.id;` line, add:

```typescript
        this.presence.join(connectionId, userId, channel);
        this.broadcastToChannel(channel, {
          type: 'presence.join',
          id: randomUUID(),
          payload: { userId, channel, connectionId },
          timestamp: Date.now(),
        }, connectionId);
```

Add `presence.list` handler in the switch statement:

```typescript
      case 'presence.list': {
        const channel = (msg.payload.channel as string) ?? '';
        const entries = this.presence.listByChannel(channel);
        this.sendTo(connectionId, {
          type: 'presence.list',
          id: randomUUID(),
          payload: { channel, entries },
          timestamp: Date.now(),
        });
        return;
      }
```

In `handleDisconnect`, add presence leave and broadcast before `this.clients.delete(connectionId)`:

```typescript
    const entry = this.presence.leave(connectionId);
    if (entry) {
      this.broadcastToChannel(entry.channel, {
        type: 'presence.leave',
        id: randomUUID(),
        payload: { userId: entry.userId, channel: entry.channel, connectionId },
        timestamp: Date.now(),
      });
    }
```

**Step 6: Run full gateway test suite**

Run: `cd packages/core && npx vitest run src/gateway/`
Expected: All tests pass

**Step 7: Commit**

```bash
git add packages/core/src/gateway/presence.ts packages/core/src/gateway/presence.test.ts packages/core/src/gateway/server.ts
git commit -m "feat: add per-channel presence tracking with broadcast"
```

---

### Task 6: Config Hot-Reload

Add a file watcher that reloads config on changes and broadcasts updates.

**Files:**
- Create: `packages/core/src/config/watcher.ts`
- Create: `packages/core/src/config/watcher.test.ts`
- Modify: `packages/core/src/runtime/runtime.ts`

**Step 1: Write the failing tests**

Create `packages/core/src/config/watcher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigWatcher } from './watcher.js';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';

vi.mock('node:fs', () => ({
  watch: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

// Mock the yaml module
vi.mock('yaml', () => ({
  parse: vi.fn((str: string) => JSON.parse(str)),
}));

describe('ConfigWatcher', () => {
  let mockWatchCallback: ((eventType: string, filename: string) => void) | undefined;
  const mockClose = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fs.watch).mockImplementation((_path: any, _opts: any, cb?: any) => {
      mockWatchCallback = cb ?? _opts;
      return { close: mockClose } as any;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mockWatchCallback = undefined;
  });

  it('should call onChange when file changes (after debounce)', async () => {
    const onChange = vi.fn();
    const newConfig = { version: '0.2.0', gateway: { port: 9999 } };
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(newConfig));

    const watcher = new ConfigWatcher('/path/to/config.yaml', onChange, 100);
    watcher.start();

    // Simulate file change
    mockWatchCallback!('change', 'config.yaml');

    // Before debounce: onChange not called
    expect(onChange).not.toHaveBeenCalled();

    // After debounce
    await vi.advanceTimersByTimeAsync(150);

    expect(onChange).toHaveBeenCalledWith(newConfig);
  });

  it('should debounce rapid changes', async () => {
    const onChange = vi.fn();
    const config = { version: '0.2.0' };
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(config));

    const watcher = new ConfigWatcher('/path/to/config.yaml', onChange, 200);
    watcher.start();

    // Fire 5 rapid changes
    mockWatchCallback!('change', 'config.yaml');
    await vi.advanceTimersByTimeAsync(50);
    mockWatchCallback!('change', 'config.yaml');
    await vi.advanceTimersByTimeAsync(50);
    mockWatchCallback!('change', 'config.yaml');

    // Wait for debounce
    await vi.advanceTimersByTimeAsync(250);

    // Should only fire once
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('should not crash on invalid config', async () => {
    const onChange = vi.fn();
    vi.mocked(fsPromises.readFile).mockResolvedValue('not valid json or yaml');
    // The yaml mock will throw on invalid JSON
    const { parse } = await import('yaml');
    vi.mocked(parse).mockImplementation(() => { throw new Error('Parse error'); });

    const watcher = new ConfigWatcher('/path/to/config.yaml', onChange, 100);
    watcher.start();

    mockWatchCallback!('change', 'config.yaml');
    await vi.advanceTimersByTimeAsync(150);

    // onChange should NOT be called since parse failed
    expect(onChange).not.toHaveBeenCalled();
  });

  it('should not crash on file read error', async () => {
    const onChange = vi.fn();
    vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

    const watcher = new ConfigWatcher('/path/to/config.yaml', onChange, 100);
    watcher.start();

    mockWatchCallback!('change', 'config.yaml');
    await vi.advanceTimersByTimeAsync(150);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('should stop watching on stop()', () => {
    const onChange = vi.fn();
    const watcher = new ConfigWatcher('/path/to/config.yaml', onChange, 100);
    watcher.start();
    watcher.stop();

    expect(mockClose).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run src/config/watcher.test.ts`
Expected: FAIL — module `./watcher.js` doesn't exist

**Step 3: Implement ConfigWatcher**

Create `packages/core/src/config/watcher.ts`:

```typescript
import { watch, type FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { XClawConfig } from '../types/config.js';

export class ConfigWatcher {
  private watcher?: FSWatcher;
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly configPath: string,
    private readonly onChange: (newConfig: XClawConfig) => void,
    private readonly debounceMs = 500,
  ) {}

  start(): void {
    this.watcher = watch(this.configPath, {}, () => {
      this.scheduleReload();
    });
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }
  }

  private scheduleReload(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.reload().catch(() => {});
    }, this.debounceMs);
  }

  private async reload(): Promise<void> {
    try {
      const raw = await readFile(this.configPath, 'utf-8');
      const config = parseYaml(raw) as XClawConfig;
      this.onChange(config);
    } catch {
      // Parse or read failed -- keep current config, don't crash
    }
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/core && npx vitest run src/config/watcher.test.ts`
Expected: PASS — all 5 tests

**Step 5: Integrate ConfigWatcher into runtime**

In `packages/core/src/runtime/runtime.ts`, add:

```typescript
import { ConfigWatcher } from '../config/watcher.js';
```

Add field:
```typescript
  private configWatcher?: ConfigWatcher;
```

In `start()`, after `this.state = 'running';`, add:

```typescript
    // 10. Config file watcher (hot-reload)
    if (this.configPath) {
      this.configWatcher = new ConfigWatcher(this.configPath, (newConfig) => {
        this.config = newConfig;
        // Broadcast config.update to all connected clients
        if (this.gateway) {
          for (const client of this.gateway.getConnectedClients()) {
            this.gateway.sendTo(client.id, {
              type: 'config.update',
              id: `config-${Date.now()}`,
              payload: { updated: true },
              timestamp: Date.now(),
            });
          }
        }
      });
      this.configWatcher.start();
    }
```

Store `configPath` in `loadConfig`:

```typescript
  private configPath?: string;

  async loadConfig(path: string): Promise<void> {
    const loader = new ConfigLoader();
    this.config = await loader.load(path);
    this.configPath = path;
    this.state = 'configured';
  }
```

In `stop()`, add before the gateway stop:

```typescript
    if (this.configWatcher) {
      this.configWatcher.stop();
      this.configWatcher = undefined;
    }
```

**Step 6: Run full test suite**

Run: `cd packages/core && npx vitest run`
Expected: All tests pass

**Step 7: Commit**

```bash
git add packages/core/src/config/watcher.ts packages/core/src/config/watcher.test.ts packages/core/src/runtime/runtime.ts
git commit -m "feat: add config file watcher with debounced hot-reload"
```

---

### Summary

| Task | What it does | Tests |
|------|-------------|-------|
| 1 | StreamChunk type, Anthropic chatStream SSE streaming | ~8 |
| 2 | OpenAI provider (chat + chatStream) | ~8 |
| 3 | Agent incremental streaming with fallback | ~4 new |
| 4 | Gateway stream bridge (StreamBlock → WebSocket) | ~5 |
| 5 | Per-channel presence tracker | ~6 |
| 6 | Config watcher with debounced hot-reload | ~5 |

Total new tests: ~36
