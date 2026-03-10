// skills/notes/src/notesSkill.ts
import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { SkillPlugin, PluginManifest, ToolDefinition } from '@xclaw/core';

export class NotesSkill implements SkillPlugin {
  private notesDir: string;

  constructor(notesDir?: string) {
    this.notesDir = notesDir ?? join(homedir(), '.xclaw', 'notes');
  }

  manifest: PluginManifest = {
    name: 'notes',
    version: '0.1.0',
    description: 'Create, read, search, and manage Markdown notes',
    type: 'skill',
    permissions: { filesystem: ['~/.xclaw/notes/'] },
  };

  tools: ToolDefinition[] = [
    { name: 'notes_create', description: 'Create a new Markdown note', inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['title', 'content'] } },
    { name: 'notes_read', description: 'Read a note by filename', inputSchema: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } },
    { name: 'notes_list', description: 'List notes, optionally filtered by tag', inputSchema: { type: 'object', properties: { tag: { type: 'string' } } } },
    { name: 'notes_search', description: 'Full-text search across notes', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
    { name: 'notes_delete', description: 'Delete a note by filename', inputSchema: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } },
  ];

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureDir();
    switch (toolName) {
      case 'notes_create': return this.create(args);
      case 'notes_read': return this.read(args);
      case 'notes_list': return this.list(args);
      case 'notes_search': return this.search(args);
      case 'notes_delete': return this.del(args);
      default: return { error: `Unknown tool: ${toolName}` };
    }
  }

  private async ensureDir() {
    if (!existsSync(this.notesDir)) await mkdir(this.notesDir, { recursive: true });
  }

  private slugify(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  private async create(args: Record<string, unknown>) {
    const title = args.title as string;
    const content = args.content as string;
    const tags = (args.tags as string[]) ?? [];

    let slug = this.slugify(title);
    let filename = `${slug}.md`;
    let counter = 2;
    while (existsSync(join(this.notesDir, filename))) {
      filename = `${slug}-${counter}.md`;
      counter++;
    }

    const frontmatter = `---\ntitle: ${title}\ntags: [${tags.join(', ')}]\ncreated: ${new Date().toISOString()}\n---\n\n`;
    await writeFile(join(this.notesDir, filename), frontmatter + content, 'utf-8');
    return { filename, title };
  }

  private async read(args: Record<string, unknown>) {
    const filename = args.filename as string;
    const filepath = join(this.notesDir, filename);
    if (!existsSync(filepath)) return { error: `Note not found: ${filename}` };

    const raw = await readFile(filepath, 'utf-8');
    const parsed = this.parseFrontmatter(raw);
    return { filename, ...parsed };
  }

  private async list(args: Record<string, unknown>) {
    const tag = args.tag as string | undefined;
    const files = await readdir(this.notesDir);
    const notes: { filename: string; title: string; tags: string[] }[] = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const raw = await readFile(join(this.notesDir, file), 'utf-8');
      const parsed = this.parseFrontmatter(raw);
      if (tag && !parsed.tags.includes(tag)) continue;
      notes.push({ filename: file, title: parsed.title, tags: parsed.tags });
    }
    return { notes };
  }

  private async search(args: Record<string, unknown>) {
    const query = (args.query as string).toLowerCase();
    const limit = (args.limit as number) ?? 10;
    const files = await readdir(this.notesDir);
    const results: { filename: string; title: string }[] = [];

    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const raw = await readFile(join(this.notesDir, file), 'utf-8');
      const parsed = this.parseFrontmatter(raw);
      if (parsed.title.toLowerCase().includes(query) || parsed.content.toLowerCase().includes(query)) {
        results.push({ filename: file, title: parsed.title });
        if (results.length >= limit) break;
      }
    }
    return { results };
  }

  private async del(args: Record<string, unknown>) {
    const filename = args.filename as string;
    const filepath = join(this.notesDir, filename);
    if (!existsSync(filepath)) return { error: `Note not found: ${filename}` };
    await unlink(filepath);
    return { deleted: true, filename };
  }

  private parseFrontmatter(raw: string): { title: string; tags: string[]; content: string } {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
    if (!match) return { title: '', tags: [], content: raw };

    const fm = match[1];
    const content = match[2];
    const titleMatch = fm.match(/^title:\s*(.+)$/m);
    const tagsMatch = fm.match(/^tags:\s*\[([^\]]*)\]$/m);

    return {
      title: titleMatch?.[1]?.trim() ?? '',
      tags: tagsMatch?.[1] ? tagsMatch[1].split(',').map((t) => t.trim()).filter(Boolean) : [],
      content,
    };
  }
}
