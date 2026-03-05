import { describe, it, expect } from 'vitest';
import {
  TaskAnalyzer,
  TaskTier,
  ModelRouter,
  ContextManager,
  RiskAssessor,
  ApprovalEngine,
  AuditLog,
  EventBus,
} from '@xclaw/core';
import { ProviderRegistry } from '@xclaw/providers';
import type { LLMProvider, ChatRequest, ChatResponse } from '@xclaw/providers';

describe('Vertical Slice Integration', () => {
  const mockProvider: LLMProvider = {
    name: 'mock',
    models: ['mock-haiku', 'mock-sonnet', 'mock-opus'],
    async chat(request: ChatRequest): Promise<ChatResponse> {
      return {
        content: `Response to: ${request.messages[request.messages.length - 1].content}`,
        model: request.model,
        usage: { inputTokens: 50, outputTokens: 30 },
      };
    },
    async validateApiKey() { return true; },
  };

  it('should route a simple greeting through the full stack', async () => {
    // 1. Task analysis
    const analyzer = new TaskAnalyzer();
    const analysis = analyzer.analyze('你好');
    expect(analysis.tier).toBe(TaskTier.TRIVIAL);

    // 2. Model routing
    const modelRouter = new ModelRouter({
      tierModels: {
        [TaskTier.TRIVIAL]: 'mock-haiku',
        [TaskTier.SIMPLE]: 'mock-sonnet',
        [TaskTier.STANDARD]: 'mock-sonnet',
        [TaskTier.COMPLEX]: 'mock-opus',
      },
      defaultModel: 'mock-sonnet',
    });
    const model = modelRouter.selectModel(analysis.tier);
    expect(model).toBe('mock-haiku');

    // 3. Security check
    const riskAssessor = new RiskAssessor();
    const assessment = riskAssessor.assess({ operation: 'llm.chat' });
    expect(assessment.level).toBe('info');

    const approvalEngine = new ApprovalEngine({ promptLevel: 'warning' });
    const approval = await approvalEngine.requestApproval(assessment);
    expect(approval.approved).toBe(true);

    // 4. Context management
    const contextMgr = new ContextManager();
    contextMgr.addTurn('test-sess', {
      role: 'user',
      content: '你好',
      timestamp: Date.now(),
    });
    const context = contextMgr.getContext('test-sess', analysis.contextWindowTurns);
    expect(context).toHaveLength(1);

    // 5. Provider resolution and chat
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(mockProvider);
    const provider = providerRegistry.resolveModel(model)!;
    expect(provider).toBeDefined();

    const response = await provider.chat({
      model,
      messages: context.map((t) => ({ role: t.role, content: t.content })),
      maxTokens: analysis.maxOutputTokens,
    });
    expect(response.content).toContain('你好');

    // 6. Audit
    const auditLog = new AuditLog();
    const entry = auditLog.record({
      operation: 'llm.chat',
      riskLevel: 'info',
      userId: 'test-user',
      sessionId: 'test-sess',
      approved: true,
      details: { model, tier: analysis.tier },
    });
    expect(entry.operation).toBe('llm.chat');
  });

  it('should select bigger model for complex tasks', async () => {
    const analyzer = new TaskAnalyzer();
    const analysis = analyzer.analyze(
      '请帮我设计一个完整的微服务架构，包含用户认证、订单管理、支付系统、库存管理四个服务，' +
      '需要考虑服务间通信、数据一致性、故障恢复、监控告警等方面，并给出详细的技术选型方案和部署架构图。'
    );
    expect(analysis.tier).toBe(TaskTier.COMPLEX);

    const modelRouter = new ModelRouter({
      tierModels: {
        [TaskTier.TRIVIAL]: 'mock-haiku',
        [TaskTier.SIMPLE]: 'mock-sonnet',
        [TaskTier.STANDARD]: 'mock-sonnet',
        [TaskTier.COMPLEX]: 'mock-opus',
      },
      defaultModel: 'mock-sonnet',
    });
    expect(modelRouter.selectModel(analysis.tier)).toBe('mock-opus');
    expect(analysis.maxInputTokens).toBeGreaterThanOrEqual(32000);
  });
});
