import { describe, it, expect } from 'vitest';
import { PresenceTracker } from './presence.js';

describe('PresenceTracker', () => {
  it('should track a join', () => {
    const tracker = new PresenceTracker();
    tracker.join('conn-1', 'user-1', 'web');

    const all = tracker.listAll();
    expect(all).toHaveLength(1);
    expect(all[0].userId).toBe('user-1');
    expect(all[0].channel).toBe('web');
    expect(all[0].connectionId).toBe('conn-1');
    expect(all[0].joinedAt).toBeGreaterThan(0);
  });

  it('should track and remove a leave', () => {
    const tracker = new PresenceTracker();
    tracker.join('conn-1', 'user-1', 'web');

    const entry = tracker.leave('conn-1');
    expect(entry).toBeDefined();
    expect(entry!.userId).toBe('user-1');
    expect(tracker.listAll()).toHaveLength(0);
  });

  it('should return undefined for unknown leave', () => {
    const tracker = new PresenceTracker();
    expect(tracker.leave('conn-unknown')).toBeUndefined();
  });

  it('should list by channel', () => {
    const tracker = new PresenceTracker();
    tracker.join('conn-1', 'user-1', 'web');
    tracker.join('conn-2', 'user-2', 'cli');
    tracker.join('conn-3', 'user-3', 'web');

    const webEntries = tracker.listByChannel('web');
    expect(webEntries).toHaveLength(2);
    expect(webEntries.map((e) => e.userId)).toContain('user-1');
    expect(webEntries.map((e) => e.userId)).toContain('user-3');

    const cliEntries = tracker.listByChannel('cli');
    expect(cliEntries).toHaveLength(1);
  });

  it('should not have cross-channel leakage', () => {
    const tracker = new PresenceTracker();
    tracker.join('conn-1', 'user-1', 'web');

    expect(tracker.listByChannel('cli')).toHaveLength(0);
  });

  it('should handle duplicate join (same connectionId overwrites)', () => {
    const tracker = new PresenceTracker();
    tracker.join('conn-1', 'user-1', 'web');
    tracker.join('conn-1', 'user-1', 'cli');

    expect(tracker.listAll()).toHaveLength(1);
    expect(tracker.listByChannel('cli')).toHaveLength(1);
    expect(tracker.listByChannel('web')).toHaveLength(0);
  });
});
