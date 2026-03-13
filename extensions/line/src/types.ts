export interface LineConfig {
  channelSecret: string;
  channelAccessToken: string;
  webhookPort?: number;
  allowFrom?: string[];
}
