import { describe, it, expect } from 'vitest';
import { SessionManager } from './sessionManager.js';

describe('SessionManager', () => {
  it('should create a session', () => {
    const mgr = new SessionManager();
    const session = mgr.create('user-1', 'cli');
    expect(session.userId).toBe('user-1');
    expect(session.channel).toBe('cli');
  });

  it('should get an existing session by id', () => {
    const mgr = new SessionManager();
    const session = mgr.create('user-1', 'cli');
    expect(mgr.get(session.id)).toBe(session);
  });

  it('should return undefined for unknown session', () => {
    const mgr = new SessionManager();
    expect(mgr.get('nonexistent')).toBeUndefined();
  });

  it('should close a session', () => {
    const mgr = new SessionManager();
    const session = mgr.create('user-1', 'cli');
    mgr.close(session.id);
    expect(mgr.get(session.id)).toBeUndefined();
  });

  it('should list all active sessions', () => {
    const mgr = new SessionManager();
    mgr.create('user-1', 'cli');
    mgr.create('user-2', 'web');
    expect(mgr.listAll()).toHaveLength(2);
  });

  it('should touch session to update lastActiveAt', () => {
    const mgr = new SessionManager();
    const session = mgr.create('user-1', 'cli');
    const before = session.lastActiveAt;
    mgr.touch(session.id);
    expect(mgr.get(session.id)!.lastActiveAt).toBeGreaterThanOrEqual(before);
  });
});
