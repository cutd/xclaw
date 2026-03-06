import { describe, it, expect } from 'vitest';
import { formatSearchResults, formatSkillList } from './skill.js';

describe('Skill CLI helpers', () => {
  it('should format search results', () => {
    const results = [
      { name: 'github-helper', version: '2.0.0', description: 'GitHub management', downloads: 1500 },
      { name: 'git-tools', version: '1.0.0', description: 'Git utilities', downloads: 300 },
    ];
    const output = formatSearchResults(results);
    expect(output).toContain('github-helper');
    expect(output).toContain('2.0.0');
    expect(output).toContain('1500');
  });

  it('should format skill list', () => {
    const skills = [
      { name: 'github-helper', version: '2.0.0', format: 'openclaw' as const, path: '/home/user/.xclaw/skills/github-helper' },
      { name: 'my-skill', version: '1.0.0', format: 'xclaw' as const, path: '/home/user/.xclaw/skills/my-skill' },
    ];
    const output = formatSkillList(skills);
    expect(output).toContain('github-helper');
    expect(output).toContain('openclaw');
    expect(output).toContain('xclaw');
  });

  it('should handle empty search results', () => {
    const output = formatSearchResults([]);
    expect(output).toContain('No skills found');
  });
});
