export interface PresenceEntry {
  userId: string;
  channel: string;
  connectionId: string;
  joinedAt: number;
}

export class PresenceTracker {
  private entries = new Map<string, PresenceEntry>();

  join(connectionId: string, userId: string, channel: string): void {
    this.entries.set(connectionId, {
      userId,
      channel,
      connectionId,
      joinedAt: Date.now(),
    });
  }

  leave(connectionId: string): PresenceEntry | undefined {
    const entry = this.entries.get(connectionId);
    if (entry) {
      this.entries.delete(connectionId);
    }
    return entry;
  }

  listByChannel(channel: string): PresenceEntry[] {
    return [...this.entries.values()].filter((e) => e.channel === channel);
  }

  listAll(): PresenceEntry[] {
    return [...this.entries.values()];
  }
}
