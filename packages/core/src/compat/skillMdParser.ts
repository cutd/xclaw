export interface SkillMdParsed {
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * Parse a SKILL.md file into frontmatter (YAML-like) and body.
 * Supports a simple subset of YAML: scalar strings, inline arrays [a, b, c].
 * Does NOT require a full YAML parser dependency.
 */
export function parseSkillMd(content: string): SkillMdParsed {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n?---\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { frontmatter: {}, body: content };
  }

  const rawFrontmatter = fmMatch[1].trim();
  const body = fmMatch[2].trim();

  if (!rawFrontmatter) {
    return { frontmatter: {}, body };
  }

  const frontmatter: Record<string, unknown> = {};
  const lines = rawFrontmatter.split('\n');

  for (const line of lines) {
    const match = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    const rawValue = match[2].trim();

    // Inline array: [a, b, c]
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      const inner = rawValue.slice(1, -1);
      frontmatter[key] = inner.split(',').map((s) => s.trim()).filter(Boolean);
    } else {
      frontmatter[key] = rawValue;
    }
  }

  return { frontmatter, body };
}
