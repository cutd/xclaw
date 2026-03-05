import type { TaskTier } from './taskAnalyzer.js';

interface ModelRouterConfig {
  tierModels: Record<string, string>;
  defaultModel: string;
}

export class ModelRouter {
  private config: ModelRouterConfig;

  constructor(config: ModelRouterConfig) {
    this.config = config;
  }

  selectModel(tier: TaskTier): string {
    return this.config.tierModels[tier] ?? this.config.defaultModel;
  }
}
