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
import { createStreamBridge } from '../gateway/streamBridge.js';
import { ConfigLoader } from './configLoader.js';
import { ConfigWatcher } from '../config/watcher.js';
import type { XClawConfig } from '../types/config.js';
import type { AgentTier } from '../agent/types.js';
import { CronScheduler } from '../cron/scheduler.js';
import { CronJobStore } from '../cron/store.js';
import { WebhookRouter } from '../webhook/router.js';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { CronJob } from '../cron/types.js';

export type RuntimeState = 'stopped' | 'configured' | 'running';

export interface RuntimeStatus {
  state: RuntimeState;
  channels: string[];
  extensions: string[];
  uptime: number;
}

export interface RuntimeStartOptions {
  skipGateway?: boolean;
}

export class XClawRuntime {
  private state: RuntimeState = 'stopped';
  private config?: XClawConfig;
  private configPath?: string;
  private configWatcher?: ConfigWatcher;
  private startedAt = 0;

  private eventBus?: EventBus;
  private gateway?: GatewayServer;
  private pipeline?: MessagePipeline;
  private loadedChannels = new Map<string, any>();
  private loadedExtensions = new Map<string, any>();
  private cronScheduler?: CronScheduler;
  private cronStore?: CronJobStore;
  private webhookRouter?: WebhookRouter;
  private httpServer?: Server;

  async loadConfig(path: string): Promise<void> {
    const loader = new ConfigLoader();
    this.config = await loader.load(path);
    this.configPath = path;
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

      // Wire gateway messages to pipeline with stream bridge
      this.eventBus.on('gateway.message', async (event: any) => {
        const { connectionId, sessionId, message } = event;
        if (message.type !== 'chat.message') return;
        if (!this.pipeline || !this.gateway) return;

        const onStream = createStreamBridge(connectionId, (connId, msg) => {
          this.gateway!.sendTo(connId, msg);
        });

        try {
          const result = await this.pipeline.process(
            {
              id: message.id,
              source: {
                channel: 'gateway',
                userId: (message.payload.userId as string) ?? 'anonymous',
                sessionId: sessionId ?? '',
              },
              content: { type: 'text', text: message.payload.text as string },
              timestamp: message.timestamp,
            },
            onStream,
          );

          this.gateway.sendTo(connectionId, {
            type: 'chat.response',
            id: message.id,
            payload: { text: result.content, model: result.model, usage: result.usage },
            timestamp: Date.now(),
          });
        } catch {
          this.gateway.sendTo(connectionId, {
            type: 'error',
            id: message.id,
            payload: { error: 'Pipeline processing failed' },
            timestamp: Date.now(),
          });
        }
      });
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

    // 7b. Extension loading
    if (this.config.extensions) {
      for (const extConfig of this.config.extensions) {
        if (!extConfig.enabled) continue;
        try {
          await this.loadExtension(extConfig.name, extConfig.config);
        } catch {
          // Extension load failed -- continue with others
        }
      }
    }

    // 8. Cron scheduler
    const cronJobs: CronJob[] = [];
    if (this.config.cron) {
      for (const [name, jobConfig] of Object.entries(this.config.cron)) {
        cronJobs.push({
          id: `config-${name}`,
          name,
          schedule: jobConfig.schedule,
          skill: jobConfig.skill,
          action: jobConfig.action,
          args: jobConfig.args,
          channel: jobConfig.channel,
          enabled: true,
          source: 'config',
        });
      }
    }

    this.cronStore = new CronJobStore(join(homedir(), '.xclaw', 'cron-jobs.json'));
    const runtimeJobs = await this.cronStore.list();
    const allJobs = [...cronJobs, ...runtimeJobs];

    this.cronScheduler = new CronScheduler({
      executor: async (job) => {
        return { output: `Executed ${job.skill}.${job.action}` };
      },
    });
    this.cronScheduler.loadJobs(allJobs);
    this.cronScheduler.start();

    // 9. Webhook HTTP server
    if (this.config.webhooks && Object.keys(this.config.webhooks).length > 0) {
      this.webhookRouter = new WebhookRouter({
        executor: async (webhook, body) => {
          return { output: `Webhook ${webhook.name} triggered` };
        },
      });

      const webhookConfigs = Object.entries(this.config.webhooks).map(([name, wh]) => ({
        id: `wh-${name}`,
        name,
        path: wh.path,
        skill: wh.skill,
        action: wh.action,
        args: wh.args,
        secret: wh.secret,
        enabled: true,
      }));
      this.webhookRouter.loadWebhooks(webhookConfigs);

      this.httpServer = createServer(this.webhookRouter.handler());
      const webhookPort = this.config.gateway.port + 1;
      this.httpServer.listen(webhookPort, this.config.gateway.host);
    }

    this.startedAt = Date.now();
    this.state = 'running';

    // 10. Config file watcher (hot-reload)
    if (this.configPath) {
      this.configWatcher = new ConfigWatcher(this.configPath, (newConfig) => {
        this.config = newConfig;
        if (this.gateway) {
          for (const client of this.gateway.getConnectedClients()) {
            this.gateway.sendTo(client.id, {
              type: 'config.update',
              id: `config-${Date.now()}`,
              payload: { updated: true },
              timestamp: Date.now(),
            });
          }
        }
      });
      this.configWatcher.start();
    }
  }

  async stop(): Promise<void> {
    // Stop config watcher
    if (this.configWatcher) {
      this.configWatcher.stop();
      this.configWatcher = undefined;
    }

    // Stop cron scheduler
    if (this.cronScheduler) {
      this.cronScheduler.stop();
      this.cronScheduler = undefined;
    }

    // Stop webhook HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer!.close(() => resolve()));
      this.httpServer = undefined;
    }

    // Unload extensions
    for (const [, ext] of this.loadedExtensions) {
      try { await ext.onUnload(); } catch { /* ignore */ }
    }
    this.loadedExtensions.clear();

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

  async loadExtension(name: string, config: Record<string, unknown>): Promise<void> {
    const mod = await import(`@xclaw/ext-${name}`);
    const ExtClass = Object.values(mod).find(
      (val) => typeof val === 'function' && (val as any).prototype?.manifest !== undefined,
    ) as new (cfg: any) => any;

    if (!ExtClass) throw new Error(`No extension class found in @xclaw/ext-${name}`);

    const ext = new ExtClass(config);
    await ext.onLoad();
    this.loadedExtensions.set(name, ext);

    // If extension provides channels, wire them to the pipeline
    if (ext.manifest?.provides?.channels && ext.send && this.pipeline) {
      this.wireChannel(name, ext);
    }
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
      extensions: [...this.loadedExtensions.keys()],
      uptime: this.startedAt > 0 ? Date.now() - this.startedAt : 0,
    };
  }

  getPipeline(): MessagePipeline | undefined {
    return this.pipeline;
  }

  getGateway(): GatewayServer | undefined {
    return this.gateway;
  }

  getCronScheduler(): CronScheduler | undefined {
    return this.cronScheduler;
  }

  getCronStore(): CronJobStore | undefined {
    return this.cronStore;
  }
}
