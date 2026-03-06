import type { ToolDefinition } from '../types/plugin.js';

export interface McpServerInfo {
  name: string;
  version: string;
}

interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class McpServerBridge {
  private readonly info: McpServerInfo;

  constructor(info: McpServerInfo) {
    this.info = info;
  }

  /**
   * Convert xclaw ToolDefinitions to MCP tool format.
   * Optionally filter by prefix (e.g., skill name).
   */
  convertToMcpTools(tools: ToolDefinition[], prefix?: string): McpToolDef[] {
    const filtered = prefix
      ? tools.filter((t) => t.name.startsWith(`${prefix}:`))
      : tools;

    return filtered.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  getServerInfo(): McpServerInfo {
    return { ...this.info };
  }
}
