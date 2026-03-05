export type PluginFormat = 'xclaw' | 'openclaw' | 'mcp' | 'claudeCode' | 'unknown';

export function detectPluginFormat(pkg: Record<string, unknown>): PluginFormat {
  const keywords = (pkg.keywords as string[]) ?? [];

  if (keywords.includes('xclaw-plugin') || keywords.includes('xclaw-skill') || keywords.includes('xclaw-channel')) {
    return 'xclaw';
  }
  if (keywords.includes('openclaw-extension') || keywords.includes('openclaw-skill')) {
    return 'openclaw';
  }

  const engines = pkg.engines as Record<string, string> | undefined;
  if (engines?.mcp) {
    return 'mcp';
  }

  return 'unknown';
}
