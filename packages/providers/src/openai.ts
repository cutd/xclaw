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
        try { args = JSON.parse(tc.function.arguments); } catch { /* empty */ }
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
