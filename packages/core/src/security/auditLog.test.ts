import { describe, it, expect } from 'vitest';
import { AuditLog } from './auditLog.js';

describe('AuditLog', () => {
  it('should record entries with auto-generated id and timestamp', () => {
    const log = new AuditLog();
    log.record({
      operation: 'file.read',
      riskLevel: 'info',
      userId: 'user-1',
      sessionId: 'session-1',
      approved: true,
    });
    const entries = log.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBeDefined();
    expect(entries[0].timestamp).toBeGreaterThan(0);
    expect(entries[0].operation).toBe('file.read');
    expect(entries[0].approved).toBe(true);
  });

  it('should query by userId', () => {
    const log = new AuditLog();
    log.record({ operation: 'file.read', riskLevel: 'info', userId: 'user-1', sessionId: 's1', approved: true });
    log.record({ operation: 'file.write', riskLevel: 'notice', userId: 'user-2', sessionId: 's2', approved: true });
    log.record({ operation: 'file.delete', riskLevel: 'warning', userId: 'user-1', sessionId: 's1', approved: false });
    const results = log.query({ userId: 'user-1' });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.userId === 'user-1')).toBe(true);
  });

  it('should query by operation', () => {
    const log = new AuditLog();
    log.record({ operation: 'file.read', riskLevel: 'info', userId: 'u1', sessionId: 's1', approved: true });
    log.record({ operation: 'file.read', riskLevel: 'info', userId: 'u2', sessionId: 's2', approved: true });
    log.record({ operation: 'file.delete', riskLevel: 'warning', userId: 'u1', sessionId: 's1', approved: false });
    const results = log.query({ operation: 'file.read' });
    expect(results).toHaveLength(2);
  });

  it('should query by riskLevel', () => {
    const log = new AuditLog();
    log.record({ operation: 'file.read', riskLevel: 'info', userId: 'u1', sessionId: 's1', approved: true });
    log.record({ operation: 'file.delete', riskLevel: 'warning', userId: 'u1', sessionId: 's1', approved: false });
    const results = log.query({ riskLevel: 'warning' });
    expect(results).toHaveLength(1);
    expect(results[0].operation).toBe('file.delete');
  });

  it('should query by since timestamp', () => {
    const log = new AuditLog();
    log.record({ operation: 'file.read', riskLevel: 'info', userId: 'u1', sessionId: 's1', approved: true });
    const entries = log.getAll();
    // Use a cutoff strictly after the first entry's timestamp
    const cutoff = entries[0].timestamp + 1;
    log.record({ operation: 'file.delete', riskLevel: 'warning', userId: 'u1', sessionId: 's1', approved: false });
    const results = log.query({ since: cutoff });
    expect(results).toHaveLength(1);
    expect(results[0].operation).toBe('file.delete');
  });

  it('should combine multiple filters', () => {
    const log = new AuditLog();
    log.record({ operation: 'file.read', riskLevel: 'info', userId: 'user-1', sessionId: 's1', approved: true });
    log.record({ operation: 'file.delete', riskLevel: 'warning', userId: 'user-1', sessionId: 's1', approved: false });
    log.record({ operation: 'file.delete', riskLevel: 'warning', userId: 'user-2', sessionId: 's2', approved: true });
    const results = log.query({ userId: 'user-1', riskLevel: 'warning' });
    expect(results).toHaveLength(1);
    expect(results[0].operation).toBe('file.delete');
    expect(results[0].userId).toBe('user-1');
  });

  it('should return all entries with getAll', () => {
    const log = new AuditLog();
    log.record({ operation: 'a', riskLevel: 'info', userId: 'u', sessionId: 's', approved: true });
    log.record({ operation: 'b', riskLevel: 'info', userId: 'u', sessionId: 's', approved: true });
    log.record({ operation: 'c', riskLevel: 'info', userId: 'u', sessionId: 's', approved: true });
    expect(log.getAll()).toHaveLength(3);
  });
});
