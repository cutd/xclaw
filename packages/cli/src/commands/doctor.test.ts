import { describe, it, expect } from 'vitest';
import { runDoctorChecks, formatDoctorResults } from './doctor.js';

describe('doctor command', () => {
  it('should return an array of check results', async () => {
    const results = await runDoctorChecks();
    expect(results.length).toBeGreaterThanOrEqual(3);
    for (const r of results) {
      expect(['pass', 'fail', 'warn']).toContain(r.status);
    }
  });

  it('should format results with icons', () => {
    const formatted = formatDoctorResults([
      { name: 'Test', status: 'pass', message: 'OK' },
      { name: 'Test2', status: 'fail', message: 'Bad' },
    ]);
    expect(formatted).toContain('\u2705');
    expect(formatted).toContain('\u274C');
  });
});
