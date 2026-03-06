import {
  TaskAnalyzer,
  TaskTier,
  ModelRouter,
  ContextManager,
  RiskAssessor,
  ApprovalEngine,
  AuditLog,
  EventBus,
  MessagePipeline,
  AgentDispatcher,
  LightweightAgent,
  StandardAgent,
  ExpertAgent,
  SandboxManager,
  VmIsolateBackend,
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

  // ── Core services ──
  const eventBus = new EventBus();

  // ── Provider ──
  const providerRegistry = new ProviderRegistry();
  const anthropic = new AnthropicProvider({ apiKey: options.apiKey });
  providerRegistry.register(anthropic);

  const defaultModel = options.model ?? 'claude-sonnet-4-5';
  const resolveProvider = (model: string) => {
    const provider = providerRegistry.resolveModel(model);
    if (!provider) throw new Error(`No provider for model: ${model}`);
    return provider;
  };

  // ── Sandbox ──
  const sandboxManager = new SandboxManager({
    backends: [new VmIsolateBackend()],
    defaultMode: 'passthrough',
  });

  // ── Agents ──
  const toolExecutor = async (toolName: string, args: Record<string, unknown>) => {
    const sb = await sandboxManager.create({ mode: 'passthrough' });
    try {
      const result = await sandboxManager.execute(sb.id, toolName, Object.values(args).map(String));
      return result.stdout || result.stderr;
    } finally {
      await sandboxManager.destroy(sb.id);
    }
  };

  const lightweightAgent = new LightweightAgent(resolveProvider(defaultModel));
  const standardAgent = new StandardAgent(resolveProvider(defaultModel), toolExecutor);
  const expertAgent = new ExpertAgent(resolveProvider(defaultModel), toolExecutor, {
    subAgentFactory: () => new LightweightAgent(resolveProvider(defaultModel)),
  });

  const dispatcher = new AgentDispatcher({
    tierLevels: {
      trivial: 'lightweight',
      simple: 'lightweight',
      standard: 'standard',
      complex: 'expert',
    },
    agents: {
      lightweight: lightweightAgent,
      standard: standardAgent,
      expert: expertAgent,
    },
  });

  // ── Pipeline ──
  const pipeline = new MessagePipeline({
    eventBus,
    riskAssessor: new RiskAssessor(),
    approvalEngine: new ApprovalEngine({
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
    }),
    auditLog: new AuditLog(),
    taskAnalyzer: new TaskAnalyzer(),
    modelRouter: new ModelRouter({
      tierModels: {
        [TaskTier.TRIVIAL]: 'claude-haiku-3-5',
        [TaskTier.SIMPLE]: 'claude-sonnet-4-5',
        [TaskTier.STANDARD]: 'claude-sonnet-4-5',
        [TaskTier.COMPLEX]: 'claude-opus-4-6',
      },
      defaultModel,
    }),
    contextManager: new ContextManager(),
    dispatcher,
  });

  // ── CLI Channel ──
  const cliChannel = new CLIChannel();

  cliChannel.onMessage(async (msg: UnifiedMessage) => {
    if (msg.content.type !== 'text' || !msg.content.text) return;

    try {
      const result = await pipeline.process(msg);
      await cliChannel.send({
        targetChannel: 'cli',
        targetUserId: 'local',
        targetSessionId: msg.source.sessionId,
        content: { type: 'text', text: result.content },
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
