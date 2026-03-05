import type { PluginManifest, ToolDefinition } from '@xclaw/core';

export abstract class BaseSkillPlugin {
  abstract manifest: PluginManifest;
  abstract tools: ToolDefinition[];

  abstract execute(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}
