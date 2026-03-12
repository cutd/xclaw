import type { UnifiedMessage, OutgoingMessage } from './message.js';

export interface ExtensionProvides {
  channels?: string[];
  memory?: string;
  voice?: boolean;
  tools?: string[];
  device?: string[];
}

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  type: 'channel' | 'skill' | 'provider' | 'extension';
  provides?: ExtensionProvides;
  compatibility?: {
    xclaw?: string;
    openclaw?: string;
    mcp?: boolean;
    claudeCode?: boolean;
  };
  permissions?: {
    network?: string[];
    filesystem?: string[];
    system?: string[];
  };
}

export interface ChannelPlugin {
  manifest: PluginManifest;
  onLoad(): Promise<void>;
  onUnload(): Promise<void>;
  onMessage(handler: (msg: UnifiedMessage) => Promise<void>): void;
  send(msg: OutgoingMessage): Promise<void>;
}

export interface SkillPlugin {
  manifest: PluginManifest;
  tools: ToolDefinition[];
  execute(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
