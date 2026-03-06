import type { Agent, AgentContext, AgentResult, AgentTier, StreamCallback } from './types.js';

export interface AgentDispatcherConfig {
  tierLevels: Record<string, AgentTier>;
  agents: Record<AgentTier, Agent>;
}

export class AgentDispatcher {
  private readonly config: AgentDispatcherConfig;

  constructor(config: AgentDispatcherConfig) {
    this.config = config;
  }

  async dispatch(context: AgentContext, onStream?: StreamCallback): Promise<AgentResult> {
    const agentLevel = this.config.tierLevels[context.tier] ?? 'standard';
    const agent = this.config.agents[agentLevel] ?? this.config.agents.standard;
    return agent.run(context, onStream);
  }

  resolveLevel(tier: string): AgentTier {
    return this.config.tierLevels[tier] ?? 'standard';
  }
}
