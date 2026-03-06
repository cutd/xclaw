import type { PluginManifest, ToolDefinition } from '../types/plugin.js';

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'sse';
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export class McpClientBridge {
  readonly serverConfig: McpServerConfig;

  constructor(config: McpServerConfig) {
    this.serverConfig = config;
  }

  /**
   * Convert MCP tool definitions to xclaw ToolDefinitions.
   * Tool names are prefixed with `mcp:<serverName>:` to avoid collisions.
   */
  convertTools(mcpTools: McpTool[]): ToolDefinition[] {
    return mcpTools.map((tool) => ({
      name: `mcp:${this.serverConfig.name}:${tool.name}`,
      description: tool.description ?? '',
      inputSchema: tool.inputSchema ?? {},
    }));
  }

  /**
   * Generate a PluginManifest representing this MCP server as an xclaw skill.
   */
  toManifest(): PluginManifest {
    return {
      name: `mcp:${this.serverConfig.name}`,
      version: '0.0.0',
      description: `MCP server: ${this.serverConfig.name}`,
      type: 'skill',
      compatibility: {
        mcp: true,
      },
    };
  }

  /**
   * Extract the original MCP tool name from a prefixed xclaw tool name.
   * e.g., "mcp:filesystem:read_file" -> "read_file"
   */
  extractToolName(prefixedName: string): string | null {
    const prefix = `mcp:${this.serverConfig.name}:`;
    if (!prefixedName.startsWith(prefix)) return null;
    return prefixedName.slice(prefix.length);
  }
}
