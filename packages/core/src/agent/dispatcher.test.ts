import { describe, it, expect, vi } from 'vitest';
import { AgentDispatcher } from './dispatcher.js';
import type { Agent, AgentContext, AgentResult } from './types.js';

function mockAgent(level: string, content: string): Agent {
  return {
    level: level as Agent['level'],
    run: vi.fn().mockResolvedValue({
      content,
      model: 'mock',
      usage: { inputTokens: 10, outputTokens: 5 },
    } satisfies AgentResult),
  };
}

describe('AgentDispatcher', () => {
  it('should route trivial tier to lightweight agent', async () => {
    const lightweight = mockAgent('lightweight', 'light response');
    const standard = mockAgent('standard', 'standard response');
    const expert = mockAgent('expert', 'expert response');

    const dispatcher = new AgentDispatcher({
      tierLevels: { trivial: 'lightweight', simple: 'lightweight', standard: 'standard', complex: 'expert' },
      agents: { lightweight, standard, expert },
    });

    const ctx: AgentContext = {
      sessionId: 's1', userId: 'u1', message: 'hi',
      tier: 'trivial', model: 'm', maxTokens: 500,
      conversationHistory: [], tools: [],
    };

    const result = await dispatcher.dispatch(ctx);
    expect(result.content).toBe('light response');
    expect(lightweight.run).toHaveBeenCalled();
    expect(standard.run).not.toHaveBeenCalled();
  });

  it('should route complex tier to expert agent', async () => {
    const lightweight = mockAgent('lightweight', 'light');
    const standard = mockAgent('standard', 'standard');
    const expert = mockAgent('expert', 'expert response');

    const dispatcher = new AgentDispatcher({
      tierLevels: { trivial: 'lightweight', simple: 'lightweight', standard: 'standard', complex: 'expert' },
      agents: { lightweight, standard, expert },
    });

    const ctx: AgentContext = {
      sessionId: 's1', userId: 'u1', message: 'design a microservice',
      tier: 'complex', model: 'm', maxTokens: 32000,
      conversationHistory: [], tools: [],
    };

    const result = await dispatcher.dispatch(ctx);
    expect(result.content).toBe('expert response');
    expect(expert.run).toHaveBeenCalled();
  });

  it('should fall back to standard for unknown tier', async () => {
    const lightweight = mockAgent('lightweight', 'light');
    const standard = mockAgent('standard', 'fallback');
    const expert = mockAgent('expert', 'expert');

    const dispatcher = new AgentDispatcher({
      tierLevels: { trivial: 'lightweight', simple: 'lightweight', standard: 'standard', complex: 'expert' },
      agents: { lightweight, standard, expert },
    });

    const ctx: AgentContext = {
      sessionId: 's1', userId: 'u1', message: 'test',
      tier: 'unknown_tier', model: 'm', maxTokens: 4000,
      conversationHistory: [], tools: [],
    };

    const result = await dispatcher.dispatch(ctx);
    expect(result.content).toBe('fallback');
  });
});
