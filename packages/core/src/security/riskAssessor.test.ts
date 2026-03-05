import { describe, it, expect } from 'vitest';
import { RiskAssessor } from './riskAssessor.js';

describe('RiskAssessor', () => {
  it('should rate file read as INFO', () => {
    const assessor = new RiskAssessor();
    const result = assessor.assess({ operation: 'file.read', target: '/tmp/test.txt' });
    expect(result.level).toBe('info');
  });

  it('should rate file delete as WARNING', () => {
    const assessor = new RiskAssessor();
    const result = assessor.assess({ operation: 'file.delete', target: '/tmp/test.txt' });
    expect(result.level).toBe('warning');
  });

  it('should rate unsigned skill install as DANGER', () => {
    const assessor = new RiskAssessor();
    const result = assessor.assess({ operation: 'skill.install', unsigned: true });
    expect(result.level).toBe('danger');
  });

  it('should rate system exec as WARNING', () => {
    const assessor = new RiskAssessor();
    const result = assessor.assess({ operation: 'system.exec', command: 'ls -la' });
    expect(result.level).toBe('warning');
  });

  it('should never return a blocked level', () => {
    const assessor = new RiskAssessor();
    const ops = [
      { operation: 'file.delete', target: '/' },
      { operation: 'skill.install', unsigned: true },
      { operation: 'system.exec', command: 'rm -rf /' },
    ];
    for (const op of ops) {
      const result = assessor.assess(op);
      expect(['info', 'notice', 'warning', 'danger']).toContain(result.level);
    }
  });
});
