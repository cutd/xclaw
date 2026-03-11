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

    const textBlocks = streamBlocks.filter((b: any) => b.type === 'text');
    expect(textBlocks).toHaveLength(2);
    expect(textBlocks[0].content).toBe('Hello');
    expect(textBlocks[1].content).toBe(' world');
    expect(streamBlocks.some((b: any) => b.type === 'done')).toBe(true);
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
    expect(onStream).toHaveBeenCalledWith(expect.objectContaining({ type: 'text', content: 'No stream' }));
    expect(onStream).toHaveBeenCalledWith(expect.objectContaining({ type: 'done' }));
  });
});
