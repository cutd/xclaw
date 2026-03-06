import { describe, it, expect, vi } from 'vitest';
import { LightweightAgent } from './lightweight.js';
import type { AgentContext } from './types.js';

interface ChatResponse {
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  stopReason?: string;
}

interface LLMProvider {
  name: string;
  models: readonly string[];
  chat: (req: unknown) => Promise<ChatResponse>;
  validateApiKey: () => Promise<boolean>;
}

function mockProvider(response: Partial<ChatResponse>): LLMProvider {
  return {
    name: 'mock',
    models: ['mock-model'],
    chat: vi.fn().mockResolvedValue({
      content: response.content ?? 'mock response',
      model: response.model ?? 'mock-model',
      usage: response.usage ?? { inputTokens: 10, outputTokens: 5 },
      stopReason: response.stopReason ?? 'end_turn',
    }),
    validateApiKey: vi.fn().mockResolvedValue(true),
  };
}

describe('LightweightAgent', () => {
  it('should call LLM and return result without tools', async () => {
    const provider = mockProvider({ content: 'Hello!' });
    const agent = new LightweightAgent(provider);

    const ctx: AgentContext = {
      sessionId: 'sess-1',
      userId: 'user-1',
      message: 'hi',
      tier: 'trivial',
      model: 'mock-model',
      maxTokens: 200,
      conversationHistory: [],
      tools: [],
    };

    const result = await agent.run(ctx);
    expect(result.content).toBe('Hello!');
    expect(result.toolExecutions).toBeUndefined();
    expect(provider.chat).toHaveBeenCalledOnce();
  });

  it('should pass conversation history as messages', async () => {
    const provider = mockProvider({ content: 'response' });
    const agent = new LightweightAgent(provider);

    const ctx: AgentContext = {
      sessionId: 'sess-1',
      userId: 'user-1',
      message: 'follow up',
      tier: 'simple',
      model: 'mock-model',
      maxTokens: 1000,
      conversationHistory: [
        { role: 'user', content: 'first message' },
        { role: 'assistant', content: 'first reply' },
      ],
      tools: [],
    };

    await agent.run(ctx);
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.messages).toHaveLength(3); // 2 history + 1 current
  });

  it('should have level = lightweight', () => {
    const provider = mockProvider({});
    const agent = new LightweightAgent(provider);
    expect(agent.level).toBe('lightweight');
  });
});
