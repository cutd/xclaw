export type ConnectionState = 'disconnected' | 'connected' | 'reconnecting';

export interface GatewayMessage {
  type: string;
  id: string;
  payload: Record<string, unknown>;
  timestamp: number;
  sessionId?: string;
}

type MessageHandler = (msg: GatewayMessage) => void;

export class GatewayClient {
  private url: string;
  private ws: WebSocket | null = null;
  private handlers = new Map<string, MessageHandler[]>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  state: ConnectionState = 'disconnected';
  sessionId = '';

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.state = 'connected';
      this.reconnectAttempt = 0;
      this.sendSessionCreate();
      this.emit('_connected', {} as GatewayMessage);
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as GatewayMessage;
        if (msg.type === 'session.create' && msg.payload.sessionId) {
          this.sessionId = msg.payload.sessionId as string;
        }
        this.emit(msg.type, msg);
      } catch { /* ignore malformed */ }
    };
    this.ws.onclose = () => {
      this.state = 'reconnecting';
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {};
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.state = 'disconnected';
  }

  sendChatMessage(text: string): void {
    this.send({ type: 'chat.message', id: crypto.randomUUID(), payload: { text }, timestamp: Date.now() });
  }

  sendStatusQuery(): void {
    this.send({ type: 'status.query', id: crypto.randomUUID(), payload: {}, timestamp: Date.now() });
  }

  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: MessageHandler): void {
    const list = this.handlers.get(type);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  private send(msg: GatewayMessage): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private emit(type: string, msg: GatewayMessage): void {
    for (const handler of this.handlers.get(type) ?? []) {
      handler(msg);
    }
  }

  private sendSessionCreate(): void {
    this.send({ type: 'session.create', id: crypto.randomUUID(), payload: { userId: 'web-user', clientType: 'web' }, timestamp: Date.now() });
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
