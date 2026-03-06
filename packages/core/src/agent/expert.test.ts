import { describe, it, expect, vi } from 'vitest';
import { ExpertAgent } from './expert.js';
import type { AgentContext, Agent, AgentResult } from './types.js';

interface ChatResponse {
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; id: string }>;
  stopReason?: string;
}

function mockProvider(responses: Partial<ChatResponse>[]) {
  let callIndex = 0;
  return {
    name: 'mock',
    models: ['mock-model'],
    chat: vi.fn().mockImplementation(async () => {
      const r = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return {
        content: r.content ?? '',
        model: r.model ?? 'mock-model',
        usage: r.usage ?? { inputTokens: 10, outputTokens: 5 },
        toolCalls: r.toolCalls,
        stopReason: r.stopReason ?? 'end_turn',
      };
    }),
    validateApiKey: vi.fn().mockResolvedValue(true),
  };
}

describe('ExpertAgent', () => {
  it('should behave like StandardAgent for simple tool calls', async () => {
    const provider = mockProvider([
      {
        content: '',
        toolCalls: [{ name: 'shell', args: { command: 'date' }, id: 'tc1' }],
        stopReason: 'tool_use',
      },
      { content: 'Today is Friday.', stopReason: 'end_turn' },
    ]);
    const toolExecutor = vi.fn().mockResolvedValue('Fri Mar 6');
    const agent = new ExpertAgent(provider, toolExecutor);

    const ctx: AgentContext = {
      sessionId: 's1', userId: 'u1', message: 'what day is it?',
      tier: 'complex', model: 'mock-model', maxTokens: 16000,
      conversationHistory: [],
      tools: [{ name: 'shell', description: 'run', inputSchema: {} }],
    };

    const result = await agent.run(ctx);
    expect(result.content).toBe('Today is Friday.');
  });

  it('should support sub-agent delegation via __delegate tool', async () => {
    const provider = mockProvider([
      {
        content: '',
        toolCalls: [{ name: '__delegate', args: { subtask: 'summarize this', tier: 'lightweight' }, id: 'del1' }],
        stopReason: 'tool_use',
      },
      { content: 'Based on the summary: all good.', stopReason: 'end_turn' },
    ]);
    const toolExecutor = vi.fn().mockResolvedValue('summary text');

    const subAgent: Agent = {
      level: 'lightweight',
      run: vi.fn().mockResolvedValue({
        content: 'This is a summary.',
        model: 'mock-model',
        usage: { inputTokens: 5, outputTokens: 3 },
      }),
    };

    const agent = new ExpertAgent(provider, toolExecutor, {
      subAgentFactory: () => subAgent,
    });

    const ctx: AgentContext = {
      sessionId: 's1', userId: 'u1', message: 'analyze and summarize',
      tier: 'complex', model: 'mock-model', maxTokens: 16000,
      conversationHistory: [],
      tools: [],
    };

    const result = await agent.run(ctx);
    expect(subAgent.run).toHaveBeenCalled();
    expect(result.content).toBe('Based on the summary: all good.');
  });

  it('should have level = expert', () => {
    const provider = mockProvider([]);
    const agent = new ExpertAgent(provider, vi.fn());
    expect(agent.level).toBe('expert');
  });
});
