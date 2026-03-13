export interface IMessageConfig {
  serverUrl: string;
  password: string;
  allowFrom?: string[];
  pollIntervalMs?: number;
}
