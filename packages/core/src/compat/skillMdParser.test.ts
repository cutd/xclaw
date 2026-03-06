import { describe, it, expect } from 'vitest';
import { parseSkillMd } from './skillMdParser.js';

describe('parseSkillMd', () => {
  it('should parse YAML frontmatter and body', () => {
    const content = `---
name: github-helper
version: 2.0.0
description: Manage GitHub PRs and issues
tags: [development, github]
---

You are a GitHub assistant. You can create PRs, review code, and manage issues.

## Tools
- create_pr: Create a pull request
- review_pr: Review a pull request`;

    const result = parseSkillMd(content);
    expect(result.frontmatter.name).toBe('github-helper');
    expect(result.frontmatter.version).toBe('2.0.0');
    expect(result.frontmatter.description).toBe('Manage GitHub PRs and issues');
    expect(result.body).toContain('You are a GitHub assistant');
    expect(result.body).toContain('## Tools');
  });

  it('should handle missing frontmatter', () => {
    const content = 'Just a skill with no frontmatter.';
    const result = parseSkillMd(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('Just a skill with no frontmatter.');
  });

  it('should handle empty frontmatter', () => {
    const content = '---\n---\nBody text.';
    const result = parseSkillMd(content);
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe('Body text.');
  });

  it('should parse tags as array', () => {
    const content = `---
name: test
tags: [a, b, c]
---
Body.`;
    const result = parseSkillMd(content);
    expect(result.frontmatter.tags).toEqual(['a', 'b', 'c']);
  });

  it('should trim whitespace from values', () => {
    const content = `---
name:   spaced-name
description:   A description with spaces
---
Body.`;
    const result = parseSkillMd(content);
    expect(result.frontmatter.name).toBe('spaced-name');
    expect(result.frontmatter.description).toBe('A description with spaces');
  });
});
