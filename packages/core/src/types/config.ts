export type SandboxMode = 'ephemeral' | 'persistent' | 'passthrough';

export type AgentLevel = 'lightweight' | 'standard' | 'expert';

export interface GatewayConfig {
  host: string;
  port: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
}

export interface AgentConfig {
  maxConcurrentAgents: number;
  defaultTimeout: number;
  tierLevels: Record<string, AgentLevel>;
}

export interface XClawConfig {
  version: string;
  providers: ProviderConfig[];
  channels: ChannelConfig[];
  security: SecurityConfig;
  router: RouterConfig;
  sandbox: SandboxConfig;
  budget: BudgetConfig;
  gateway: GatewayConfig;
  agent: AgentConfig;
}

export interface ProviderConfig {
  name: string;
  type: 'anthropic' | 'openai' | 'google' | 'ollama' | 'custom';
  apiKeyRef?: string;
  baseUrl?: string;
  models?: string[];
  default?: boolean;
}

export interface ChannelConfig {
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface SecurityConfig {
  promptLevel: 'none' | 'danger' | 'warning' | 'notice' | 'info';
  trustedSkills: string[];
  approvalRules: ApprovalRule[];
}

export interface ApprovalRule {
  operation: string;
  threshold: string;
  action: 'confirm' | 'always_allow';
}

export interface RouterConfig {
  defaultProvider: string;
  defaultModel: string;
  tierModels: Record<string, string>;
  contextWindow: number;
  summarizeAfterTurns: number;
}

export interface SandboxConfig {
  defaultMode: SandboxMode;
  backend: 'auto' | 'bwrap' | 'macSandbox' | 'vmIsolate';
  memoryLimitMB: number;
  timeoutSeconds: number;
  networkWhitelist: string[];
  persistDir: string;
  perSkillMode?: Record<string, SandboxMode>;
}

export interface BudgetConfig {
  monthlyTokenLimit: number;
  warningThreshold: number;
  perChannelLimits: Record<string, number>;
}
