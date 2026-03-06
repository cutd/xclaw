import { describe, it, expect, vi } from 'vitest';
import { McpClientBridge } from './mcpClient.js';

describe('McpClientBridge', () => {
  it('should convert MCP tools to xclaw ToolDefinitions', () => {
    const mcpTools = [
      {
        name: 'read_file',
        description: 'Read a file from the filesystem',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
      {
        name: 'list_dir',
        description: 'List directory contents',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
    ];

    const bridge = new McpClientBridge({ name: 'filesystem', command: 'npx', args: ['@mcp/fs'] });
    const tools = bridge.convertTools(mcpTools);

    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('mcp:filesystem:read_file');
    expect(tools[0].description).toBe('Read a file from the filesystem');
    expect(tools[0].inputSchema).toEqual(mcpTools[0].inputSchema);
  });

  it('should prefix tool names with mcp:<server>:', () => {
    const mcpTools = [
      { name: 'search', description: 'Search', inputSchema: {} },
    ];

    const bridge = new McpClientBridge({ name: 'web-search', command: 'npx', args: ['@mcp/search'] });
    const tools = bridge.convertTools(mcpTools);

    expect(tools[0].name).toBe('mcp:web-search:search');
  });

  it('should generate a PluginManifest for the MCP server', () => {
    const bridge = new McpClientBridge({ name: 'filesystem', command: 'npx', args: ['@mcp/fs'] });
    const manifest = bridge.toManifest();

    expect(manifest.name).toBe('mcp:filesystem');
    expect(manifest.type).toBe('skill');
    expect(manifest.compatibility?.mcp).toBe(true);
  });

  it('should store server config', () => {
    const config = { name: 'test', command: 'node', args: ['server.js'], env: { KEY: 'val' } };
    const bridge = new McpClientBridge(config);
    expect(bridge.serverConfig).toEqual(config);
  });
});
