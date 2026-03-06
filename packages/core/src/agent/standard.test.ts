import { describe, it, expect, vi } from 'vitest';
import { StandardAgent } from './standard.js';
import type { AgentContext } from './types.js';

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

describe('StandardAgent', () => {
  it('should return direct response when no tool calls', async () => {
    const provider = mockProvider([{ content: 'No tools needed' }]);
    const toolExecutor = vi.fn();
    const agent = new StandardAgent(provider, toolExecutor);

    const ctx: AgentContext = {
      sessionId: 's1', userId: 'u1', message: 'what is 2+2?',
      tier: 'standard', model: 'mock-model', maxTokens: 4000,
      conversationHistory: [],
      tools: [{ name: 'calculator', description: 'math', inputSchema: {} }],
    };

    const result = await agent.run(ctx);
    expect(result.content).toBe('No tools needed');
    expect(toolExecutor).not.toHaveBeenCalled();
  });

  it('should execute tool calls and feed results back to LLM', async () => {
    const provider = mockProvider([
      {
        content: '',
        toolCalls: [{ name: 'shell', args: { command: 'ls' }, id: 'tc1' }],
        stopReason: 'tool_use',
      },
      { content: 'There are 2 files.', stopReason: 'end_turn' },
    ]);
    const toolExecutor = vi.fn().mockResolvedValue('file1.txt\nfile2.txt');
    const agent = new StandardAgent(provider, toolExecutor);

    const ctx: AgentContext = {
      sessionId: 's1', userId: 'u1', message: 'list files',
      tier: 'standard', model: 'mock-model', maxTokens: 4000,
      conversationHistory: [],
      tools: [{ name: 'shell', description: 'run commands', inputSchema: {} }],
    };

    const result = await agent.run(ctx);
    expect(toolExecutor).toHaveBeenCalledWith('shell', { command: 'ls' });
    expect(result.content).toBe('There are 2 files.');
    expect(result.toolExecutions).toHaveLength(1);
    expect(result.toolExecutions![0].toolName).toBe('shell');
  });

  it('should stop after maxToolRounds to prevent infinite loops', async () => {
    const provider = mockProvider([
      {
        content: '',
        toolCalls: [{ name: 'shell', args: { command: 'loop' }, id: 'tc' }],
        stopReason: 'tool_use',
      },
    ]);
    const toolExecutor = vi.fn().mockResolvedValue('ok');
    const agent = new StandardAgent(provider, toolExecutor, { maxToolRounds: 3 });

    const ctx: AgentContext = {
      sessionId: 's1', userId: 'u1', message: 'loop',
      tier: 'standard', model: 'mock-model', maxTokens: 4000,
      conversationHistory: [],
      tools: [{ name: 'shell', description: 'run', inputSchema: {} }],
    };

    const result = await agent.run(ctx);
    expect(toolExecutor).toHaveBeenCalledTimes(3);
  });

  it('should have level = standard', () => {
    const provider = mockProvider([]);
    const agent = new StandardAgent(provider, vi.fn());
    expect(agent.level).toBe('standard');
  });
});
