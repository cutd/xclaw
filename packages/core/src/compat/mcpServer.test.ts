import { describe, it, expect } from 'vitest';
import { McpServerBridge } from './mcpServer.js';
import type { ToolDefinition } from '../types/plugin.js';

describe('McpServerBridge', () => {
  it('should convert xclaw ToolDefinitions to MCP tool format', () => {
    const tools: ToolDefinition[] = [
      { name: 'notes:create', description: 'Create a note', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } },
      { name: 'notes:list', description: 'List notes', inputSchema: { type: 'object' } },
    ];

    const bridge = new McpServerBridge({ name: 'xclaw', version: '0.1.0' });
    const mcpTools = bridge.convertToMcpTools(tools);

    expect(mcpTools).toHaveLength(2);
    expect(mcpTools[0].name).toBe('notes:create');
    expect(mcpTools[0].description).toBe('Create a note');
  });

  it('should generate server info', () => {
    const bridge = new McpServerBridge({ name: 'xclaw', version: '0.1.0' });
    const info = bridge.getServerInfo();

    expect(info.name).toBe('xclaw');
    expect(info.version).toBe('0.1.0');
  });

  it('should filter tools by prefix', () => {
    const tools: ToolDefinition[] = [
      { name: 'notes:create', description: 'Create', inputSchema: {} },
      { name: 'github:pr', description: 'PR', inputSchema: {} },
      { name: 'notes:list', description: 'List', inputSchema: {} },
    ];

    const bridge = new McpServerBridge({ name: 'xclaw', version: '0.1.0' });
    const filtered = bridge.convertToMcpTools(tools, 'notes');

    expect(filtered).toHaveLength(2);
  });
});
