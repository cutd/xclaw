import type { SkillPlugin, PluginManifest, ToolDefinition } from '@xclaw/core';

export class ChatCommandsSkill implements SkillPlugin {
  manifest: PluginManifest = {
    name: 'chat-commands',
    version: '0.1.0',
    description: 'In-chat slash commands for session management',
    type: 'skill',
    permissions: {},
  };

  tools: ToolDefinition[] = [
    { name: 'chat_status', description: 'Show current session status', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } } } },
    { name: 'chat_new', description: 'Create a new session', inputSchema: { type: 'object', properties: {} } },
    { name: 'chat_reset', description: 'Reset current session context', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } } } },
    { name: 'chat_compact', description: 'Compress current context', inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } } } },
    { name: 'chat_think', description: 'Set reasoning level', inputSchema: { type: 'object', properties: { level: { type: 'string', enum: ['fast', 'balanced', 'thorough'] } }, required: ['level'] } },
    { name: 'chat_verbose', description: 'Toggle verbose output', inputSchema: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] } },
  ];

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'chat_status':
        return { sessionId: args.sessionId ?? 'unknown', action: 'status', message: 'Session active' };
      case 'chat_new':
        return { action: 'new_session', message: 'New session created' };
      case 'chat_reset':
        return { action: 'reset', sessionId: args.sessionId, message: 'Session context reset' };
      case 'chat_compact':
        return { action: 'compact', sessionId: args.sessionId, message: 'Context compacted' };
      case 'chat_think':
        return { action: 'think', level: args.level, message: `Reasoning level set to ${args.level}` };
      case 'chat_verbose':
        return { action: 'verbose', verbose: args.enabled, message: `Verbose mode ${args.enabled ? 'on' : 'off'}` };
      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  }
}
