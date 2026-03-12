import { WebSocketServer, type WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import { EventBus } from '../events/eventBus.js';
import { SessionManager } from './sessionManager.js';
import { PresenceTracker } from './presence.js';
import type { GatewayConfig } from '../types/config.js';
import type { GatewayMessage, ClientConnection, ClientType } from './types.js';

export interface GatewayServerOptions {
  config: GatewayConfig;
  eventBus: EventBus;
  statusProvider?: () => string[];
}

export interface StatusData {
  channels: string[];
  sessions: number;
  uptime: number;
}

export function buildStatusResponse(data: StatusData): GatewayMessage {
  return {
    type: 'status.response',
    id: randomUUID(),
    payload: {
      channels: data.channels,
      sessions: data.sessions,
      uptime: data.uptime,
    },
    timestamp: Date.now(),
  };
}

export class GatewayServer {
  private wss?: WebSocketServer;
  private clients = new Map<string, { ws: WebSocket; connection: ClientConnection }>();
  private readonly config: GatewayConfig;
  private readonly eventBus: EventBus;
  private readonly statusProvider?: () => string[];
  readonly sessions: SessionManager;
  readonly presence = new PresenceTracker();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private startedAt = Date.now();

  constructor(options: GatewayServerOptions) {
    this.config = options.config;
    this.eventBus = options.eventBus;
    this.statusProvider = options.statusProvider;
    this.sessions = new SessionManager();
  }

  async start(): Promise<void> {
    this.wss = new WebSocketServer({
      host: this.config.host,
      port: this.config.port,
    });

    this.wss.on('connection', (ws) => this.handleConnection(ws));

    this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), this.config.heartbeatIntervalMs);

    await this.eventBus.emit('gateway.started', {
      host: this.config.host,
      port: this.config.port,
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    for (const { ws } of this.clients.values()) {
      ws.close(1000, 'Server shutting down');
    }
    this.clients.clear();
    await new Promise<void>((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
    await this.eventBus.emit('gateway.stopped');
  }

  sendTo(connectionId: string, message: GatewayMessage): void {
    const client = this.clients.get(connectionId);
    if (client && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  broadcastToSession(sessionId: string, message: GatewayMessage): void {
    for (const { ws, connection } of this.clients.values()) {
      if (connection.sessionId === sessionId && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }
  }

  broadcastToChannel(channel: string, message: GatewayMessage, excludeConnectionId?: string): void {
    const members = this.presence.listByChannel(channel);
    for (const member of members) {
      if (member.connectionId === excludeConnectionId) continue;
      this.sendTo(member.connectionId, message);
    }
  }

  getConnectedClients(): ClientConnection[] {
    return [...this.clients.values()].map((c) => c.connection);
  }

  private handleConnection(ws: WebSocket): void {
    const connId = `conn-${randomUUID().slice(0, 8)}`;
    const connection: ClientConnection = {
      id: connId,
      clientType: 'cli',
      connectedAt: Date.now(),
      sessionId: '',
    };
    this.clients.set(connId, { ws, connection });

    (ws as unknown as Record<string, unknown>).__alive = true;

    ws.on('message', (data) => this.handleMessage(connId, data.toString()));
    ws.on('pong', () => {
      (ws as unknown as Record<string, unknown>).__alive = true;
    });
    ws.on('close', () => this.handleDisconnect(connId));

    this.eventBus.emit('gateway.client_connected', { connectionId: connId });
  }

  private async handleMessage(connectionId: string, raw: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (!client) return;

    let msg: GatewayMessage;
    try {
      msg = JSON.parse(raw) as GatewayMessage;
    } catch {
      this.sendTo(connectionId, {
        type: 'error',
        id: randomUUID(),
        payload: { error: 'Invalid JSON' },
        timestamp: Date.now(),
      });
      return;
    }

    if (msg.payload.clientType) {
      client.connection.clientType = msg.payload.clientType as ClientType;
    }

    switch (msg.type) {
      case 'ping':
        this.sendTo(connectionId, {
          type: 'pong',
          id: randomUUID(),
          payload: {},
          timestamp: Date.now(),
        });
        return;

      case 'session.create': {
        const userId = (msg.payload.userId as string) ?? 'anonymous';
        const channel = (msg.payload.channel as string) ?? client.connection.clientType;
        const session = this.sessions.create(userId, channel);
        client.connection.sessionId = session.id;
        this.presence.join(connectionId, userId, channel);
        this.broadcastToChannel(channel, {
          type: 'presence.join',
          id: randomUUID(),
          payload: { userId, channel, connectionId },
          timestamp: Date.now(),
        }, connectionId);
        this.sendTo(connectionId, {
          type: 'session.create',
          id: randomUUID(),
          payload: { sessionId: session.id },
          timestamp: Date.now(),
        });
        return;
      }

      case 'session.close': {
        const sessionId = msg.sessionId ?? client.connection.sessionId;
        if (sessionId) {
          this.sessions.close(sessionId);
        }
        return;
      }

      case 'status.query': {
        const status = buildStatusResponse({
          channels: this.statusProvider ? this.statusProvider() : [],
          sessions: this.sessions.listAll().length,
          uptime: Date.now() - this.startedAt,
        });
        this.sendTo(connectionId, status);
        return;
      }

      case 'presence.list': {
        const channel = (msg.payload.channel as string) ?? '';
        const entries = this.presence.listByChannel(channel);
        this.sendTo(connectionId, {
          type: 'presence.list',
          id: randomUUID(),
          payload: { channel, entries },
          timestamp: Date.now(),
        });
        return;
      }
    }

    if (client.connection.sessionId) {
      this.sessions.touch(client.connection.sessionId);
    }

    await this.eventBus.emit('gateway.message', {
      connectionId,
      sessionId: client.connection.sessionId,
      message: msg,
    });
  }

  private handleDisconnect(connectionId: string): void {
    const entry = this.presence.leave(connectionId);
    if (entry) {
      this.broadcastToChannel(entry.channel, {
        type: 'presence.leave',
        id: randomUUID(),
        payload: { userId: entry.userId, channel: entry.channel, connectionId },
        timestamp: Date.now(),
      });
    }
    this.clients.delete(connectionId);
    this.eventBus.emit('gateway.client_disconnected', { connectionId });
  }

  private checkHeartbeats(): void {
    for (const [connId, { ws }] of this.clients) {
      if ((ws as unknown as Record<string, unknown>).__alive === false) {
        ws.terminate();
        this.handleDisconnect(connId);
        continue;
      }
      (ws as unknown as Record<string, unknown>).__alive = false;
      ws.ping();
    }
  }
}
