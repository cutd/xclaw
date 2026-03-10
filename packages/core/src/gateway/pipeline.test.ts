import { describe, it, expect, vi } from 'vitest';
import { MessagePipeline } from './pipeline.js';
import { EventBus } from '../events/eventBus.js';
import { RiskAssessor } from '../security/riskAssessor.js';
import { ApprovalEngine } from '../security/approvalEngine.js';
import { AuditLog } from '../security/auditLog.js';
import { TaskAnalyzer } from '../router/taskAnalyzer.js';
import { ModelRouter } from '../router/modelRouter.js';
import { ContextManager } from '../router/contextManager.js';
import { AgentDispatcher } from '../agent/dispatcher.js';
import type { Agent, AgentResult } from '../agent/types.js';
import type { UnifiedMessage } from '../types/message.js';

function mockAgent(content: string): Agent {
  return {
    level: 'lightweight',
    run: vi.fn().mockResolvedValue({
      content,
      model: 'mock',
      usage: { inputTokens: 10, outputTokens: 5 },
    } satisfies AgentResult),
  };
}

describe('MessagePipeline', () => {
  it('should process a message through the full pipeline', async () => {
    const eventBus = new EventBus();
    const agent = mockAgent('Hello back!');

    const pipeline = new MessagePipeline({
      eventBus,
      riskAssessor: new RiskAssessor(),
      approvalEngine: new ApprovalEngine({ promptLevel: 'none' }),
      auditLog: new AuditLog(),
      taskAnalyzer: new TaskAnalyzer(),
      modelRouter: new ModelRouter({
        tierModels: { trivial: 'mock', simple: 'mock', standard: 'mock', complex: 'mock' },
        defaultModel: 'mock',
      }),
      contextManager: new ContextManager(),
      dispatcher: new AgentDispatcher({
        tierLevels: { trivial: 'lightweight', simple: 'lightweight', standard: 'standard', complex: 'expert' },
        agents: { lightweight: agent, standard: agent, expert: agent },
      }),
    });

    const msg: UnifiedMessage = {
      id: 'msg-1',
      source: { channel: 'cli', userId: 'user-1', sessionId: 'sess-1' },
      content: { type: 'text', text: 'hello' },
      timestamp: Date.now(),
    };

    const result = await pipeline.process(msg);
    expect(result.content).toBe('Hello back!');
    expect(agent.run).toHaveBeenCalled();
  });

  it('should record audit log entry', async () => {
    const auditLog = new AuditLog();
    const agent = mockAgent('response');

    const pipeline = new MessagePipeline({
      eventBus: new EventBus(),
      riskAssessor: new RiskAssessor(),
      approvalEngine: new ApprovalEngine({ promptLevel: 'none' }),
      auditLog,
      taskAnalyzer: new TaskAnalyzer(),
      modelRouter: new ModelRouter({
        tierModels: { trivial: 'mock', simple: 'mock', standard: 'mock', complex: 'mock' },
        defaultModel: 'mock',
      }),
      contextManager: new ContextManager(),
      dispatcher: new AgentDispatcher({
        tierLevels: { trivial: 'lightweight', simple: 'lightweight', standard: 'standard', complex: 'expert' },
        agents: { lightweight: agent, standard: agent, expert: agent },
      }),
    });

    const msg: UnifiedMessage = {
      id: 'msg-2',
      source: { channel: 'cli', userId: 'user-1', sessionId: 'sess-2' },
      content: { type: 'text', text: 'test' },
      timestamp: Date.now(),
    };

    await pipeline.process(msg);
    const entries = auditLog.getAll();
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].operation).toBe('chat.message');
  });

  it('should inject memories into agent context when memoryManager is provided', async () => {
    const mockMemoryManager = {
      retrieve: vi.fn().mockResolvedValue([
        {
          entry: { id: '1', content: 'User prefers TypeScript', source: 'conversation', userId: 'user-1', tags: [], importance: 0.5, createdAt: Date.now(), updatedAt: Date.now(), accessCount: 0 },
          score: 0.8,
          source: 'hybrid',
        },
      ]),
      store: vi.fn().mockResolvedValue({}),
      storeDailyLog: vi.fn(),
    };

    const agent = mockAgent('TypeScript it is!');

    const pipelineWithMemory = new MessagePipeline({
      eventBus: new EventBus(),
      riskAssessor: new RiskAssessor(),
      approvalEngine: new ApprovalEngine({ promptLevel: 'none' }),
      auditLog: new AuditLog(),
      taskAnalyzer: new TaskAnalyzer(),
      modelRouter: new ModelRouter({
        tierModels: { trivial: 'mock', simple: 'mock', standard: 'mock', complex: 'mock' },
        defaultModel: 'mock',
      }),
      contextManager: new ContextManager(),
      dispatcher: new AgentDispatcher({
        tierLevels: { trivial: 'lightweight', simple: 'lightweight', standard: 'standard', complex: 'expert' },
        agents: { lightweight: agent, standard: agent, expert: agent },
      }),
      memoryManager: mockMemoryManager as any,
    });

    const msg: UnifiedMessage = {
      id: 'msg-3',
      source: { channel: 'cli', userId: 'user-1', sessionId: 'sess-3' },
      content: { type: 'text', text: 'What language do I prefer?' },
      timestamp: Date.now(),
    };

    const result = await pipelineWithMemory.process(msg);
    expect(result.content).toBe('TypeScript it is!');
    expect(mockMemoryManager.retrieve).toHaveBeenCalledOnce();
    expect(mockMemoryManager.storeDailyLog).toHaveBeenCalledOnce();
  });

  it('should fire-and-forget memory extraction when extractor is configured', async () => {
    const extractorProcess = vi.fn().mockResolvedValue(undefined);
    const mockExtractor = { process: extractorProcess };
    const agent = mockAgent('Got it, dark mode!');

    const pipeline = new MessagePipeline({
      eventBus: new EventBus(),
      riskAssessor: new RiskAssessor(),
      approvalEngine: new ApprovalEngine({ promptLevel: 'none' }),
      auditLog: new AuditLog(),
      taskAnalyzer: new TaskAnalyzer(),
      modelRouter: new ModelRouter({
        tierModels: { trivial: 'mock', simple: 'mock', standard: 'mock', complex: 'mock' },
        defaultModel: 'mock',
      }),
      contextManager: new ContextManager(),
      dispatcher: new AgentDispatcher({
        tierLevels: { trivial: 'lightweight', simple: 'lightweight', standard: 'standard', complex: 'expert' },
        agents: { lightweight: agent, standard: agent, expert: agent },
      }),
      memoryExtractor: mockExtractor as any,
    });

    const msg: UnifiedMessage = {
      id: 'msg-extract',
      source: { channel: 'cli', userId: 'user-1', sessionId: 'sess-extract' },
      content: { type: 'text', text: 'I prefer dark mode for all my editors' },
      timestamp: Date.now(),
    };

    const result = await pipeline.process(msg);

    // Result should return without waiting for extraction
    expect(result.content).toBeDefined();

    // Give the fire-and-forget a tick to execute
    await new Promise((r) => setTimeout(r, 10));

    // Extractor should have been called with the user message and response
    expect(extractorProcess).toHaveBeenCalledOnce();
    expect(extractorProcess).toHaveBeenCalledWith(
      expect.any(String),   // userMessage
      expect.any(String),   // assistantResponse
      expect.any(String),   // category
      expect.any(String),   // userId
      expect.any(String),   // sessionId
    );
  });
});
