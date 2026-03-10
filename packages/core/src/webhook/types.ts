export interface WebhookConfig {
  id: string;
  name: string;
  path: string;
  skill: string;
  action: string;
  args?: Record<string, unknown>;
  secret?: string;
  enabled: boolean;
}
