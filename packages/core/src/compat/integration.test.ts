import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PluginScanner } from './scanner.js';
import { OpenClawAdapter } from './openclawAdapter.js';
import { ClaudeCodeAdapter } from './claudeCodeAdapter.js';
import { McpClientBridge } from './mcpClient.js';
import { McpServerBridge } from './mcpServer.js';
import { parseSkillMd } from './skillMdParser.js';
import { PluginRegistry } from '../plugin/registry.js';

describe('Compat Integration', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'xclaw-compat-int-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should scan OpenClaw skill, convert, and register in PluginRegistry', async () => {
    // Create an OpenClaw-style skill directory
    const skillDir = join(testDir, 'github-helper');
    await mkdir(skillDir);
    await writeFile(join(skillDir, 'package.json'), JSON.stringify({
      name: 'github-helper',
      version: '2.0.0',
      description: 'GitHub management',
      keywords: ['openclaw-skill'],
    }));

    // Scan
    const scanner = new PluginScanner();
    const results = await scanner.scan(testDir);
    expect(results).toHaveLength(1);

    // Convert
    const adapter = new OpenClawAdapter();
    const manifest = adapter.toManifest(results[0]);
    expect(manifest.compatibility?.openclaw).toBeDefined();

    // Register
    const registry = new PluginRegistry();
    registry.register(manifest, { activate: () => {}, deactivate: () => {} });
    expect(registry.get('github-helper')).toBeDefined();
    expect(registry.listByType('skill')).toHaveLength(1);
  });

  it('should scan SKILL.md, parse frontmatter, and register', async () => {
    const skillDir = join(testDir, 'notes');
    await mkdir(skillDir);
    await writeFile(join(skillDir, 'SKILL.md'), `---
name: notes
version: 1.0.0
description: Note taking
tags: [productivity]
---

You can take notes and search them.`);

    const scanner = new PluginScanner();
    const results = await scanner.scan(testDir);
    expect(results).toHaveLength(1);

    const parsed = parseSkillMd(results[0].skillMd!);
    expect(parsed.frontmatter.name).toBe('notes');
    expect(parsed.body).toContain('take notes');

    const adapter = new OpenClawAdapter();
    const manifest = adapter.toManifest(results[0]);
    expect(manifest.name).toBe('notes');
  });

  it('should scan Claude Code skills and register', async () => {
    const claudeDir = join(testDir, '.claude', 'skills');
    await mkdir(claudeDir, { recursive: true });
    await writeFile(join(claudeDir, 'style-guide.md'), '# Style Guide\nUse 2-space indentation.');

    const ccAdapter = new ClaudeCodeAdapter();
    const skills = await ccAdapter.scanClaudeDir(testDir);
    expect(skills).toHaveLength(1);

    const manifest = ccAdapter.toManifest(skills[0]);
    expect(manifest.name).toBe('claude-code:style-guide');

    const registry = new PluginRegistry();
    registry.register(manifest, skills[0]);
    expect(registry.get('claude-code:style-guide')).toBeDefined();
  });

  it('should bridge MCP tools end-to-end', () => {
    // MCP Client: convert MCP tools to xclaw
    const clientBridge = new McpClientBridge({ name: 'fs', command: 'npx', args: ['@mcp/fs'] });
    const xcTools = clientBridge.convertTools([
      { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object' } },
    ]);
    expect(xcTools[0].name).toBe('mcp:fs:read_file');

    // MCP Server: convert xclaw tools back to MCP format
    const serverBridge = new McpServerBridge({ name: 'xclaw', version: '0.1.0' });
    const mcpTools = serverBridge.convertToMcpTools(xcTools);
    expect(mcpTools[0].name).toBe('mcp:fs:read_file');
  });

  it('should handle mixed plugin formats in a single directory', async () => {
    // xclaw native
    const xcDir = join(testDir, 'xclaw-skill');
    await mkdir(xcDir);
    await writeFile(join(xcDir, 'package.json'), JSON.stringify({
      name: 'xclaw-skill',
      keywords: ['xclaw-skill'],
    }));

    // OpenClaw
    const ocDir = join(testDir, 'oc-skill');
    await mkdir(ocDir);
    await writeFile(join(ocDir, 'package.json'), JSON.stringify({
      name: 'oc-skill',
      keywords: ['openclaw-skill'],
    }));

    // SKILL.md only
    const mdDir = join(testDir, 'md-skill');
    await mkdir(mdDir);
    await writeFile(join(mdDir, 'SKILL.md'), '---\nname: md-skill\n---\nA skill.');

    // Not a plugin
    const emptyDir = join(testDir, 'not-a-plugin');
    await mkdir(emptyDir);

    const scanner = new PluginScanner();
    const results = await scanner.scan(testDir);
    expect(results).toHaveLength(3);

    const formats = results.map((r) => r.format).sort();
    expect(formats).toEqual(['openclaw', 'openclaw', 'xclaw']);
  });
});
