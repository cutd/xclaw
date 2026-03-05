import {
  TaskAnalyzer,
  ModelRouter,
  ContextManager,
  TaskTier,
  RiskAssessor,
  ApprovalEngine,
  AuditLog,
  EventBus,
} from '@xclaw/core';
import { ProviderRegistry, AnthropicProvider } from '@xclaw/providers';
import type { UnifiedMessage } from '@xclaw/core';
import type { RiskAssessment } from '@xclaw/core';
import { CLIChannel } from '../channel/cliChannel.js';

export interface StartOptions {
  apiKey: string;
  model?: string;
  provider?: string;
}

export async function startCommand(options: StartOptions): Promise<void> {
  console.log('🦞 xclaw starting...\n');

  // Initialize core components
  const eventBus = new EventBus();
  const taskAnalyzer = new TaskAnalyzer();
  const modelRouter = new ModelRouter({
    tierModels: {
      [TaskTier.TRIVIAL]: 'claude-haiku-3-5',
      [TaskTier.SIMPLE]: 'claude-sonnet-4-5',
      [TaskTier.STANDARD]: 'claude-sonnet-4-5',
      [TaskTier.COMPLEX]: 'claude-opus-4-6',
    },
    defaultModel: options.model ?? 'claude-sonnet-4-5',
  });
  const contextManager = new ContextManager();
  const riskAssessor = new RiskAssessor();
  const auditLog = new AuditLog();

  const approvalEngine = new ApprovalEngine({
    promptLevel: 'warning',
    prompter: async (assessment: RiskAssessment) => {
      console.log(`\n⚠️  ${assessment.description}`);
      console.log('  按 Enter 继续，输入 cancel 取消');
      return new Promise((resolve) => {
        process.stdin.once('data', (data) => {
          const input = data.toString().trim().toLowerCase();
          resolve({ chosenOption: input === 'cancel' ? 'cancel' : 'proceed' });
        });
      });
    },
  });

  // Initialize provider
  const providerRegistry = new ProviderRegistry();
  const anthropic = new AnthropicProvider({ apiKey: options.apiKey });
  providerRegistry.register(anthropic);

  // Initialize CLI channel
  const cliChannel = new CLIChannel();

  cliChannel.onMessage(async (msg: UnifiedMessage) => {
    if (msg.content.type !== 'text' || !msg.content.text) return;

    const text = msg.content.text;

    // Analyze task complexity
    const analysis = taskAnalyzer.analyze(text);
    const selectedModel = modelRouter.selectModel(analysis.tier);

    // Add to context
    contextManager.addTurn(msg.source.sessionId, {
      role: 'user',
      content: text,
      timestamp: msg.timestamp,
    });

    // Get conversation context
    const history = contextManager.getContext(msg.source.sessionId, analysis.contextWindowTurns);
    const messages = history.map((t) => ({ role: t.role, content: t.content }));

    // Resolve provider
    const provider = providerRegistry.resolveModel(selectedModel);
    if (!provider) {
      await cliChannel.send({
        targetChannel: 'cli',
        targetUserId: 'local',
        targetSessionId: msg.source.sessionId,
        content: { type: 'text', text: `错误: 无法找到模型 ${selectedModel} 的提供商` },
      });
      cliChannel.prompt();
      return;
    }

    try {
      const response = await provider.chat({
        model: selectedModel,
        messages,
        maxTokens: analysis.maxOutputTokens,
      });

      // Record in context
      contextManager.addTurn(msg.source.sessionId, {
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
      });

      // Audit log
      auditLog.record({
        operation: 'llm.chat',
        riskLevel: 'info',
        userId: msg.source.userId,
        sessionId: msg.source.sessionId,
        approved: true,
        details: {
          model: selectedModel,
          tier: analysis.tier,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
      });

      await cliChannel.send({
        targetChannel: 'cli',
        targetUserId: 'local',
        targetSessionId: msg.source.sessionId,
        content: { type: 'text', text: response.content },
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await cliChannel.send({
        targetChannel: 'cli',
        targetUserId: 'local',
        targetSessionId: msg.source.sessionId,
        content: {
          type: 'text',
          text: `❌ 请求失败: ${errMsg}\n  建议: 检查 API Key 是否有效 (xclaw doctor)`,
        },
      });
    }

    cliChannel.prompt();
  });

  await cliChannel.onLoad();
  console.log('✅ xclaw 已就绪! 输入消息开始对话，/quit 退出\n');
  cliChannel.prompt();
}
