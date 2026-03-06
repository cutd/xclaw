import { describe, it, expect } from 'vitest';
import { formatMemoryEntries, formatMemoryFile } from './memory.js';

describe('Memory CLI helpers', () => {
  it('should format memory entries for display', () => {
    const entries = [
      { content: 'User prefers TypeScript', tags: ['preference'], timestamp: Date.now() },
      { content: 'Project uses pnpm', tags: ['project'], timestamp: Date.now() },
    ];
    const output = formatMemoryEntries(entries);
    expect(output).toContain('TypeScript');
    expect(output).toContain('preference');
    expect(output).toContain('pnpm');
  });

  it('should format empty entries', () => {
    const output = formatMemoryEntries([]);
    expect(output).toContain('No memories');
  });

  it('should format MEMORY.md content for display', () => {
    const content = '# Memory\n\n### 2026-03-06 [preference]\n\nUser prefers dark mode\n';
    const output = formatMemoryFile(content);
    expect(output).toContain('dark mode');
  });
});
