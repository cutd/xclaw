import type { Agent, AgentContext, AgentResult, StreamCallback } from './types.js';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
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

    const response = await this.provider.chat({
      model: context.model,
      messages,
      maxTokens: context.maxTokens,
      systemPrompt: context.systemPrompt,
    });

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
