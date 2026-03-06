import { describe, it, expect } from 'vitest';
import type { AgentContext, AgentResult, ToolExecution } from './types.js';

describe('Agent types', () => {
  it('should accept a valid agent context', () => {
    const ctx: AgentContext = {
      sessionId: 'sess-1',
      userId: 'user-1',
      message: 'hello',
      tier: 'trivial',
      model: 'claude-haiku-3-5',
      maxTokens: 500,
      conversationHistory: [],
      tools: [],
    };
    expect(ctx.tier).toBe('trivial');
  });

  it('should accept agent result with tool calls', () => {
    const result: AgentResult = {
      content: 'done',
      model: 'claude-sonnet-4-5',
      usage: { inputTokens: 100, outputTokens: 50 },
      toolExecutions: [
        {
          toolName: 'shell',
          args: { command: 'ls' },
          result: 'file1.txt\nfile2.txt',
          durationMs: 120,
        },
      ],
      stopReason: 'end_turn',
    };
    expect(result.toolExecutions).toHaveLength(1);
  });
});
