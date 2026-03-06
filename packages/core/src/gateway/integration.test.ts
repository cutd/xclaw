import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events/eventBus.js';
import { RiskAssessor } from '../security/riskAssessor.js';
import { ApprovalEngine } from '../security/approvalEngine.js';
import { AuditLog } from '../security/auditLog.js';
import { TaskAnalyzer } from '../router/taskAnalyzer.js';
import { ModelRouter } from '../router/modelRouter.js';
import { ContextManager } from '../router/contextManager.js';
import { AgentDispatcher } from '../agent/dispatcher.js';
import { LightweightAgent } from '../agent/lightweight.js';
import { StandardAgent } from '../agent/standard.js';
import { ExpertAgent } from '../agent/expert.js';
import { MessagePipeline } from './pipeline.js';
import type { UnifiedMessage } from '../types/message.js';

function mockProvider(content: string) {
  return {
    name: 'mock',
    models: ['mock-model'],
    chat: vi.fn().mockResolvedValue({
      content,
      model: 'mock-model',
      usage: { inputTokens: 20, outputTokens: 10 },
      stopReason: 'end_turn',
    }),
    validateApiKey: vi.fn().mockResolvedValue(true),
  };
}

describe('Full Pipeline Integration', () => {
  function buildPipeline(provider: ReturnType<typeof mockProvider>) {
    const eventBus = new EventBus();
    const toolExecutor = vi.fn().mockResolvedValue('tool output');

    const lightweight = new LightweightAgent(provider);
    const standard = new StandardAgent(provider, toolExecutor);
    const expert = new ExpertAgent(provider, toolExecutor, {
      subAgentFactory: () => new LightweightAgent(provider),
    });

    return new MessagePipeline({
      eventBus,
      riskAssessor: new RiskAssessor(),
      approvalEngine: new ApprovalEngine({ promptLevel: 'none' }),
      auditLog: new AuditLog(),
      taskAnalyzer: new TaskAnalyzer(),
      modelRouter: new ModelRouter({
        tierModels: {
          trivial: 'mock-model',
          simple: 'mock-model',
          standard: 'mock-model',
          complex: 'mock-model',
        },
        defaultModel: 'mock-model',
      }),
      contextManager: new ContextManager(),
      dispatcher: new AgentDispatcher({
        tierLevels: {
          trivial: 'lightweight',
          simple: 'lightweight',
          standard: 'standard',
          complex: 'expert',
        },
        agents: { lightweight, standard, expert },
      }),
    });
  }

  it('should process a trivial greeting end-to-end', async () => {
    const provider = mockProvider('你好！');
    const pipeline = buildPipeline(provider);

    const msg: UnifiedMessage = {
      id: 'int-1',
      source: { channel: 'cli', userId: 'user-1', sessionId: 'int-sess-1' },
      content: { type: 'text', text: '你好' },
      timestamp: Date.now(),
    };

    const result = await pipeline.process(msg);
    expect(result.content).toBe('你好！');
    expect(provider.chat).toHaveBeenCalledOnce();
  });

  it('should process a complex request end-to-end', async () => {
    const provider = mockProvider('Here is the architecture design...');
    const pipeline = buildPipeline(provider);

    const msg: UnifiedMessage = {
      id: 'int-2',
      source: { channel: 'cli', userId: 'user-1', sessionId: 'int-sess-2' },
      content: { type: 'text', text: '请帮我设计一个完整的微服务架构系统方案，需要详细分析各个模块的职责' },
      timestamp: Date.now(),
    };

    const result = await pipeline.process(msg);
    expect(result.content).toBe('Here is the architecture design...');
    expect(provider.chat).toHaveBeenCalled();
  });

  it('should maintain conversation context across messages', async () => {
    const provider = mockProvider('context aware response');
    const pipeline = buildPipeline(provider);

    const msg1: UnifiedMessage = {
      id: 'ctx-1',
      source: { channel: 'cli', userId: 'user-1', sessionId: 'ctx-sess' },
      content: { type: 'text', text: 'my name is Alice' },
      timestamp: Date.now(),
    };
    await pipeline.process(msg1);

    const msg2: UnifiedMessage = {
      id: 'ctx-2',
      source: { channel: 'cli', userId: 'user-1', sessionId: 'ctx-sess' },
      content: { type: 'text', text: 'what is my name?' },
      timestamp: Date.now(),
    };
    await pipeline.process(msg2);

    // Second call should include conversation history
    const secondCall = provider.chat.mock.calls[1][0];
    expect(secondCall.messages.length).toBeGreaterThan(1);
  });
});
