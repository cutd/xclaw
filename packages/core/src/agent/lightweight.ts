import type { Agent, AgentContext, AgentResult, StreamCallback } from './types.js';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

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

export class LightweightAgent implements Agent {
  readonly level = 'lightweight' as const;

  constructor(private readonly provider: LLMProviderLike) {}

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
      const model = context.model;
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
}
