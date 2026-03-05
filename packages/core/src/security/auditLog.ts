import type { RiskLevel, AuditEntry } from '../types/security.js';

export interface AuditRecordInput {
  operation: string;
  riskLevel: RiskLevel;
  userId: string;
  sessionId: string;
  approved: boolean;
  details?: Record<string, unknown>;
}

export interface AuditQueryFilters {
  userId?: string;
  operation?: string;
  riskLevel?: RiskLevel;
  since?: number;
}

export class AuditLog {
  private entries: AuditEntry[] = [];
  private idCounter = 0;
  private lastTimestamp = 0;

  private generateId(): string {
    this.idCounter += 1;
    return `audit-${Date.now()}-${this.idCounter}`;
  }

  /**
   * Returns a monotonically increasing timestamp.
   * If Date.now() returns the same value as the last recorded timestamp,
   * we increment by 1 to guarantee ordering.
   */
  private nextTimestamp(): number {
    const now = Date.now();
    this.lastTimestamp = now > this.lastTimestamp ? now : this.lastTimestamp + 1;
    return this.lastTimestamp;
  }

  record(input: AuditRecordInput): AuditEntry {
    const entry: AuditEntry = {
      id: this.generateId(),
      timestamp: this.nextTimestamp(),
      operation: input.operation,
      riskLevel: input.riskLevel,
      userId: input.userId,
      sessionId: input.sessionId,
      approved: input.approved,
      details: input.details,
    };
    this.entries.push(entry);
    return entry;
  }

  query(filters: AuditQueryFilters): AuditEntry[] {
    return this.entries.filter((entry) => {
      if (filters.userId !== undefined && entry.userId !== filters.userId) {
        return false;
      }
      if (filters.operation !== undefined && entry.operation !== filters.operation) {
        return false;
      }
      if (filters.riskLevel !== undefined && entry.riskLevel !== filters.riskLevel) {
        return false;
      }
      if (filters.since !== undefined && entry.timestamp < filters.since) {
        return false;
      }
      return true;
    });
  }

  getAll(): AuditEntry[] {
    return [...this.entries];
  }
}
