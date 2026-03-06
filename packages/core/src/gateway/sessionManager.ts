import { randomUUID } from 'node:crypto';
import type { GatewaySession } from './types.js';

export class SessionManager {
  private sessions = new Map<string, GatewaySession>();

  create(userId: string, channel: string, metadata: Record<string, unknown> = {}): GatewaySession {
    const now = Date.now();
    const session: GatewaySession = {
      id: `sess-${randomUUID().slice(0, 8)}`,
      userId,
      channel,
      createdAt: now,
      lastActiveAt: now,
      metadata,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): GatewaySession | undefined {
    return this.sessions.get(id);
  }

  close(id: string): boolean {
    return this.sessions.delete(id);
  }

  touch(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActiveAt = Date.now();
    }
  }

  listAll(): GatewaySession[] {
    return [...this.sessions.values()];
  }
}
