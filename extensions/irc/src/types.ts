export interface IrcConfig {
  host: string;
  port: number;
  nick: string;
  channels: string[];
  tls?: boolean;
  password?: string;
  allowFrom?: string[];
}
