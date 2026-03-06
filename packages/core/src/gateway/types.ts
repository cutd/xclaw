export type GatewayMessageType =
  | 'chat.message'
  | 'chat.response'
  | 'chat.stream_start'
  | 'chat.stream_block'
  | 'chat.stream_end'
  | 'session.create'
  | 'session.close'
  | 'session.reset'
  | 'presence.join'
  | 'presence.leave'
  | 'presence.list'
  | 'config.update'
  | 'ping'
  | 'pong'
  | 'error';

export interface GatewayMessage {
  type: GatewayMessageType;
  id: string;
  payload: Record<string, unknown>;
  timestamp: number;
  sessionId?: string;
}

export interface GatewaySession {
  id: string;
  userId: string;
  channel: string;
  createdAt: number;
  lastActiveAt: number;
  metadata: Record<string, unknown>;
}

export type ClientType = 'cli' | 'web' | 'macos' | 'ios' | 'android' | 'mcp';

export interface ClientConnection {
  id: string;
  clientType: ClientType;
  connectedAt: number;
  sessionId: string;
}
