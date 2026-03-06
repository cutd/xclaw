import { ClawHubClient, type ClawHubSkillSummary } from '@xclaw/core';
import type { PluginFormat } from '@xclaw/core';

export interface InstalledSkill {
  name: string;
  version: string;
  format: PluginFormat;
  path: string;
}

export function formatSearchResults(results: ClawHubSkillSummary[]): string {
  if (results.length === 0) {
    return 'No skills found.';
  }

  const lines = results.map(
    (r) => `  ${r.name}@${r.version}  ${r.description}  (${r.downloads} downloads)`,
  );
  return `Found ${results.length} skill(s):\n${lines.join('\n')}`;
}

export function formatSkillList(skills: InstalledSkill[]): string {
  if (skills.length === 0) {
    return 'No skills installed.';
  }

  const lines = skills.map(
    (s) => `  ${s.name}@${s.version}  [${s.format}]  ${s.path}`,
  );
  return `Installed skills:\n${lines.join('\n')}`;
}

export async function searchSkills(query: string): Promise<void> {
  const client = new ClawHubClient();
  try {
    const results = await client.search(query);
    console.log(formatSearchResults(results.results));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Search failed: ${msg}`);
  }
}

export async function installSkill(name: string): Promise<void> {
  const client = new ClawHubClient();
  try {
    const info = await client.getSkillInfo(name);
    console.log(`Installing ${info.name}@${info.version}...`);
    const url = await client.getDownloadUrl(info.name, info.version);
    // TODO: Phase 3 follow-up — download, extract, verify, install
    console.log(`Download URL: ${url}`);
    console.log(`Skill download/install not yet implemented — coming soon.`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Install failed: ${msg}`);
  }
}
