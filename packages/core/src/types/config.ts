export interface XClawConfig {
  version: string;
  providers: ProviderConfig[];
  channels: ChannelConfig[];
  security: SecurityConfig;
  router: RouterConfig;
  sandbox: SandboxConfig;
  budget: BudgetConfig;
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
  defaultMode: 'ephemeral' | 'persistent';
  backend: 'auto' | 'bwrap' | 'macSandbox' | 'vmIsolate';
  memoryLimitMB: number;
  timeoutSeconds: number;
  networkWhitelist: string[];
  persistDir: string;
}

export interface BudgetConfig {
  monthlyTokenLimit: number;
  warningThreshold: number;
  perChannelLimits: Record<string, number>;
}
