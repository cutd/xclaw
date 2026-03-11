/**
 * LLM Provider abstraction layer.
 *
 * Defines the common interface that all LLM providers (Anthropic, OpenAI, etc.)
 * must implement, plus a registry for looking up providers by name or model.
 */

// ── Chat message types ──────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  tools?: ToolSchema[];
}

// ── Response types ──────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: TokenUsage;
  toolCalls?: ToolCall[];
  stopReason?: string;
}


// ── Streaming types ──────────────────────────────────────────────────

export interface StreamChunk {
  type: 'text_delta' | 'tool_start' | 'tool_delta' | 'tool_end' | 'done';
  text?: string;
  toolCall?: Partial<ToolCall>;
  usage?: TokenUsage;
}

// ── Provider interface ──────────────────────────────────────────────

export interface LLMProvider {
  /** Unique provider name, e.g. "anthropic", "openai". */
  readonly name: string;

  /** Model identifiers this provider can serve. */
  readonly models: readonly string[];

  /** Send a chat request and return a response. */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /** Stream a chat response as incremental chunks. Optional — not all providers support streaming. */
  chatStream?(request: ChatRequest): AsyncIterable<StreamChunk>;

  /** Validate that the configured API key is accepted by the remote service. */
  validateApiKey(): Promise<boolean>;
}

// ── Provider registry ───────────────────────────────────────────────

export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();

  /** Register a provider. Replaces any existing provider with the same name. */
  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  /** Retrieve a provider by its name. */
  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Find the provider that serves a given model identifier.
   * Returns `undefined` when no registered provider claims the model.
   */
  resolveModel(model: string): LLMProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.models.includes(model)) {
        return provider;
      }
    }
    return undefined;
  }

  /** Return every registered provider. */
  listAll(): LLMProvider[] {
    return [...this.providers.values()];
  }
}
