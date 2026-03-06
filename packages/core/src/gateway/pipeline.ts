import type { UnifiedMessage } from '../types/message.js';
import type { EventBus } from '../events/eventBus.js';
import type { RiskAssessor } from '../security/riskAssessor.js';
import type { ApprovalEngine } from '../security/approvalEngine.js';
import type { AuditLog } from '../security/auditLog.js';
import type { TaskAnalyzer } from '../router/taskAnalyzer.js';
import type { ModelRouter } from '../router/modelRouter.js';
import type { ContextManager } from '../router/contextManager.js';
import type { AgentDispatcher } from '../agent/dispatcher.js';
import type { AgentResult, StreamCallback } from '../agent/types.js';

export interface MessagePipelineConfig {
  eventBus: EventBus;
  riskAssessor: RiskAssessor;
  approvalEngine: ApprovalEngine;
  auditLog: AuditLog;
  taskAnalyzer: TaskAnalyzer;
  modelRouter: ModelRouter;
  contextManager: ContextManager;
  dispatcher: AgentDispatcher;
}

export class MessagePipeline {
  private readonly config: MessagePipelineConfig;

  constructor(config: MessagePipelineConfig) {
    this.config = config;
  }

  async process(msg: UnifiedMessage, onStream?: StreamCallback): Promise<AgentResult> {
    const { riskAssessor, approvalEngine, auditLog, taskAnalyzer, modelRouter, contextManager, dispatcher, eventBus } =
      this.config;
    const text = msg.content.text ?? '';

    // 1. Security: assess risk
    const assessment = riskAssessor.assess({ operation: 'chat.message', target: msg.source.channel });

    // 2. Security: request approval if needed
    const approval = await approvalEngine.requestApproval(assessment);
    if (!approval.approved) {
      auditLog.record({
        operation: 'chat.message',
        riskLevel: assessment.level,
        userId: msg.source.userId,
        sessionId: msg.source.sessionId,
        approved: false,
      });
      return { content: 'Operation cancelled by user.', model: '', usage: { inputTokens: 0, outputTokens: 0 } };
    }

    // 3. Router: analyze task complexity
    const analysis = taskAnalyzer.analyze(text);
    const model = modelRouter.selectModel(analysis.tier);

    // 4. Context: build conversation history
    contextManager.addTurn(msg.source.sessionId, { role: 'user', content: text, timestamp: msg.timestamp });
    const history = contextManager.getContext(msg.source.sessionId, analysis.contextWindowTurns);

    // 5. Agent: dispatch
    const result = await dispatcher.dispatch(
      {
        sessionId: msg.source.sessionId,
        userId: msg.source.userId,
        message: text,
        tier: analysis.tier,
        model,
        maxTokens: analysis.maxOutputTokens,
        conversationHistory: history.map((t) => ({ role: t.role, content: t.content })),
        tools: [],
      },
      onStream,
    );

    // 6. Context: record response
    contextManager.addTurn(msg.source.sessionId, {
      role: 'assistant',
      content: result.content,
      timestamp: Date.now(),
    });

    // 7. Audit
    auditLog.record({
      operation: 'chat.message',
      riskLevel: assessment.level,
      userId: msg.source.userId,
      sessionId: msg.source.sessionId,
      approved: true,
      details: {
        model,
        tier: analysis.tier,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
    });

    await eventBus.emit('pipeline.completed', {
      messageId: msg.id,
      sessionId: msg.source.sessionId,
      model,
      tier: analysis.tier,
    });

    return result;
  }
}
