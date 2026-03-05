/**
 * Anthropic Claude LLM provider.
 *
 * Uses the Anthropic Messages API (v1/messages) with native fetch (Node 22+).
 */

import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ToolCall,
} from './base.js';

// ── Configuration ───────────────────────────────────────────────────

export interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
}

// ── Anthropic API request / response shapes ─────────────────────────

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicRequestBody {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  system?: string;
  temperature?: number;
  tools?: AnthropicToolDef[];
}

interface AnthropicContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicResponseBody {
  id: string;
  type: 'message';
  role: 'assistant';
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ── Provider implementation ─────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly models = [
    'claude-opus-4-6',
    'claude-sonnet-4-5',
    'claude-haiku-3-5',
  ] as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  // ── LLMProvider.chat ────────────────────────────────────────────

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body = this.buildRequestBody(request);

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
      throw new Error(
        `Anthropic API error (${res.status}): ${text}`,
      );
    }

    const data = (await res.json()) as AnthropicResponseBody;
    return this.parseResponse(data);
  }

  // ── LLMProvider.validateApiKey ──────────────────────────────────

  async validateApiKey(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: 'claude-haiku-3-5',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });

      // A 401 means the key is invalid; any other status (including 200,
      // 429 rate-limit, etc.) means the key itself was accepted.
      return res.status !== 401;
    } catch {
      return false;
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private buildRequestBody(request: ChatRequest): AnthropicRequestBody {
    const messages: AnthropicMessage[] = [];
    let system: string | undefined = request.systemPrompt;

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        // Anthropic uses a top-level `system` field instead of a system message.
        system = system ? `${system}\n${msg.content}` : msg.content;
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: AnthropicRequestBody = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    if (system) {
      body.system = system;
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
    }

    return body;
  }

  private parseResponse(data: AnthropicResponseBody): ChatResponse {
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of data.content) {
      if (block.type === 'text' && block.text) {
        textContent += block.text;
      } else if (block.type === 'tool_use' && block.name && block.id) {
        toolCalls.push({
          name: block.name,
          args: block.input ?? {},
          id: block.id,
        });
      }
    }

    const response: ChatResponse = {
      content: textContent,
      model: data.model,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    };

    if (toolCalls.length > 0) {
      response.toolCalls = toolCalls;
    }
    if (data.stop_reason) {
      response.stopReason = data.stop_reason;
    }

    return response;
  }
}
