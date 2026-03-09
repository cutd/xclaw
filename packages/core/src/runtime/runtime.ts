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
import { SandboxManager } from '../sandbox/manager.js';
import { VmIsolateBackend } from '../sandbox/vmBackend.js';
import { GatewayServer } from '../gateway/server.js';
import { MessagePipeline } from '../gateway/pipeline.js';
import { ConfigLoader } from './configLoader.js';
import type { XClawConfig } from '../types/config.js';
import type { AgentTier } from '../agent/types.js';

export type RuntimeState = 'stopped' | 'configured' | 'running';

export interface RuntimeStatus {
  state: RuntimeState;
  channels: string[];
  uptime: number;
}

export interface RuntimeStartOptions {
  skipGateway?: boolean;
}

export class XClawRuntime {
  private state: RuntimeState = 'stopped';
  private config?: XClawConfig;
  private startedAt = 0;

  private eventBus?: EventBus;
  private gateway?: GatewayServer;
  private pipeline?: MessagePipeline;
  private loadedChannels = new Map<string, any>();

  async loadConfig(path: string): Promise<void> {
    const loader = new ConfigLoader();
    this.config = await loader.load(path);
    this.state = 'configured';
  }

  async start(options?: RuntimeStartOptions): Promise<void> {
    if (!this.config) {
      const loader = new ConfigLoader();
      this.config = await loader.load('');
    }

    // 1. EventBus
    this.eventBus = new EventBus();

    // 2. Sandbox
    const sandboxManager = new SandboxManager({
      backends: [new VmIsolateBackend()],
      defaultMode: this.config.sandbox.defaultMode,
    });

    // 3. Tool executor
    const toolExecutor = async (toolName: string, args: Record<string, unknown>) => {
      const sb = await sandboxManager.create({ mode: 'passthrough' });
      try {
        const result = await sandboxManager.execute(sb.id, toolName, Object.values(args).map(String));
        return result.stdout || result.stderr;
      } finally {
        await sandboxManager.destroy(sb.id);
      }
    };

    // 4. Agents (placeholder provider for now -- real providers wired in startCommand)
    const placeholderProvider = {
      chat: async () => ({ content: 'No provider configured', usage: { inputTokens: 0, outputTokens: 0 } }),
    };

    const lightweightAgent = new LightweightAgent(placeholderProvider as any);
    const standardAgent = new StandardAgent(placeholderProvider as any, toolExecutor);
    const expertAgent = new ExpertAgent(placeholderProvider as any, toolExecutor, {
      subAgentFactory: () => new LightweightAgent(placeholderProvider as any),
    });

    const dispatcher = new AgentDispatcher({
      tierLevels: (this.config.agent.tierLevels ?? {}) as Record<string, AgentTier>,
      agents: { lightweight: lightweightAgent, standard: standardAgent, expert: expertAgent },
    });

    // 5. Pipeline
    this.pipeline = new MessagePipeline({
      eventBus: this.eventBus,
      riskAssessor: new RiskAssessor(),
      approvalEngine: new ApprovalEngine({
        promptLevel: this.config.security.promptLevel as any,
        prompter: async () => ({ chosenOption: 'proceed' }),
      }),
      auditLog: new AuditLog(),
      taskAnalyzer: new TaskAnalyzer(),
      modelRouter: new ModelRouter({
        tierModels: this.config.router.tierModels,
        defaultModel: this.config.router.defaultModel,
      }),
      contextManager: new ContextManager(),
      dispatcher,
    });

    // 6. Gateway (optional -- skip for tests)
    if (!options?.skipGateway) {
      this.gateway = new GatewayServer({
        config: this.config.gateway,
        eventBus: this.eventBus,
      });
      await this.gateway.start();
    }

    // 7. Dynamic channel loading
    for (const chConfig of this.config.channels) {
      if (!chConfig.enabled) continue;
      try {
        await this.loadChannel(chConfig.name, { ...chConfig.config, enabled: true });
      } catch {
        // Channel load failed -- continue with other channels
      }
    }

    this.startedAt = Date.now();
    this.state = 'running';
  }

  async stop(): Promise<void> {
    // Unload channels
    for (const [, channel] of this.loadedChannels) {
      try { await channel.onUnload(); } catch { /* ignore */ }
    }
    this.loadedChannels.clear();

    // Stop gateway
    if (this.gateway) {
      await this.gateway.stop();
      this.gateway = undefined;
    }

    this.pipeline = undefined;
    this.eventBus = undefined;
    this.state = 'stopped';
    this.startedAt = 0;
  }

  async loadChannel(name: string, config: Record<string, unknown>): Promise<void> {
    const mod = await import(`@xclaw/channel-${name}`);
    // Find the exported channel class
    const ChannelClass = Object.values(mod).find(
      (val) => typeof val === 'function' && (val as any).prototype?.manifest !== undefined,
    ) as new (cfg: any) => any;

    if (!ChannelClass) throw new Error(`No channel class found in @xclaw/channel-${name}`);

    const channel = new ChannelClass(config);
    this.wireChannel(name, channel);
    await channel.onLoad();
    this.loadedChannels.set(name, channel);
  }

  wireChannel(name: string, channel: any): void {
    if (!this.pipeline) throw new Error('Pipeline not initialized');
    const pipeline = this.pipeline;

    channel.onMessage(async (msg: any) => {
      try {
        const result = await pipeline.process(msg);
        await channel.send({
          targetChannel: name,
          targetUserId: msg.source.userId,
          targetSessionId: msg.source.sessionId,
          content: { type: 'text', text: result.content },
        });
      } catch {
        // Pipeline error -- logged by audit
      }
    });
  }

  getStatus(): RuntimeStatus {
    return {
      state: this.state,
      channels: [...this.loadedChannels.keys()],
      uptime: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
    };
  }

  getPipeline(): MessagePipeline | undefined {
    return this.pipeline;
  }

  getGateway(): GatewayServer | undefined {
    return this.gateway;
  }
}
