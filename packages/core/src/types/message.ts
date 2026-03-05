export interface MessageSource {
  channel: string;
  userId: string;
  sessionId: string;
  raw?: unknown;
}

export interface MessageContent {
  type: 'text' | 'image' | 'file' | 'audio' | 'command';
  text?: string;
  url?: string;
  mimeType?: string;
  data?: Uint8Array;
}

export interface UnifiedMessage {
  id: string;
  source: MessageSource;
  content: MessageContent;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface OutgoingMessage {
  targetChannel: string;
  targetUserId: string;
  targetSessionId: string;
  content: MessageContent;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
}
