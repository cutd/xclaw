# Phase 7: Built-in Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement 4 built-in skills (Shell, Notes, GitHub, Web Search) as independent packages in `skills/`, each implementing the `SkillPlugin` interface.

**Architecture:** Each skill is a separate pnpm workspace package in `skills/<name>/` following the channel package pattern. Skills export a class implementing `SkillPlugin` from `@xclaw/core` with a manifest, tools array, and execute method. The Shell skill uses `child_process.execFile` with optional sandboxing. GitHub uses the `gh` CLI. Notes uses filesystem operations. Web Search uses `fetch()`.

**Tech Stack:** TypeScript 5.x, Vitest, `child_process.execFile`, Node.js `fetch()`, `@xclaw/core` types, `@xclaw/sdk` base classes

---

## Plan Overview

```
Task 1:  Shell skill — command execution with sandbox support
Task 2:  Notes skill — Markdown CRUD with YAML frontmatter
Task 3:  GitHub skill — gh CLI wrapper for issues, PRs, repos
Task 4:  Web Search skill — URL fetching and web search
```

---

### Task 1: Shell Skill

**Files:**
- Create: `skills/shell/package.json`
- Create: `skills/shell/tsconfig.json`
- Create: `skills/shell/src/index.ts`
- Create: `skills/shell/src/shellSkill.ts`
- Create: `skills/shell/src/shellSkill.test.ts`

**Step 1: Create package scaffolding**

`skills/shell/package.json`:
```json
{
  "name": "@xclaw/skill-shell",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "import": "./src/index.ts" }
  },
  "scripts": { "test": "vitest run" },
  "dependencies": {
    "@xclaw/core": "workspace:*",
    "@xclaw/sdk": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`skills/shell/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

`skills/shell/src/index.ts`:
```typescript
export { ShellSkill } from './shellSkill.js';
```

**Step 2: Write the failing test**

```typescript
// skills/shell/src/shellSkill.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ShellSkill } from './shellSkill.js';

describe('ShellSkill', () => {
  const skill = new ShellSkill();

  describe('manifest', () => {
    it('should have correct type and name', () => {
      expect(skill.manifest.type).toBe('skill');
      expect(skill.manifest.name).toBe('shell');
      expect(skill.manifest.permissions?.system).toContain('exec');
    });
  });

  describe('tools', () => {
    it('should expose shell_exec tool', () => {
      expect(skill.tools).toHaveLength(1);
      expect(skill.tools[0].name).toBe('shell_exec');
    });
  });

  describe('execute', () => {
    it('should execute a simple command', async () => {
      const result = await skill.execute('shell_exec', { command: 'echo hello' }) as any;
      expect(result.stdout.trim()).toBe('hello');
      expect(result.exitCode).toBe(0);
    });

    it('should capture stderr', async () => {
      const result = await skill.execute('shell_exec', { command: 'ls /nonexistent_path_xyz' }) as any;
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    });

    it('should respect timeout', async () => {
      const result = await skill.execute('shell_exec', { command: 'sleep 10', timeout: 500 }) as any;
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('timed out');
    }, 5000);

    it('should return error for unknown tool', async () => {
      const result = await skill.execute('unknown_tool', {});
      expect(result).toHaveProperty('error');
    });

    it('should handle empty command', async () => {
      const result = await skill.execute('shell_exec', { command: '' }) as any;
      expect(result).toHaveProperty('error');
    });
  });
});
```

**Step 3: Implement ShellSkill**

```typescript
// skills/shell/src/shellSkill.ts
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import type { SkillPlugin, PluginManifest, ToolDefinition } from '@xclaw/core';

export class ShellSkill implements SkillPlugin {
  manifest: PluginManifest = {
    name: 'shell',
    version: '0.1.0',
    description: 'Execute shell commands',
    type: 'skill',
    permissions: { system: ['exec'] },
  };

  tools: ToolDefinition[] = [
    {
      name: 'shell_exec',
      description: 'Execute a shell command and return stdout, stderr, and exit code',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The command to execute' },
          cwd: { type: 'string', description: 'Working directory (defaults to $HOME)' },
          timeout: { type: 'number', description: 'Timeout in ms (defaults to 30000)' },
        },
        required: ['command'],
      },
    },
  ];

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (toolName !== 'shell_exec') {
      return { error: `Unknown tool: ${toolName}` };
    }

    const command = args.command as string;
    if (!command) {
      return { error: 'Command is required' };
    }

    const cwd = (args.cwd as string) ?? homedir();
    const timeout = (args.timeout as number) ?? 30000;

    const tokens = this.tokenize(command);
    if (tokens.length === 0) {
      return { error: 'Command is empty' };
    }

    const [bin, ...cmdArgs] = tokens;

    return new Promise((resolve) => {
      const child = execFile(bin, cmdArgs, { cwd, timeout }, (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).killed) {
          resolve({ stdout: stdout?.toString() ?? '', stderr: 'Command timed out', exitCode: 1 });
          return;
        }
        resolve({
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          exitCode: error ? (error as any).code ?? 1 : 0,
        });
      });
    });
  }

  private tokenize(command: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuote: string | null = null;

    for (const ch of command) {
      if (inQuote) {
        if (ch === inQuote) { inQuote = null; }
        else { current += ch; }
      } else if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === ' ' || ch === '\t') {
        if (current) { tokens.push(current); current = ''; }
      } else {
        current += ch;
      }
    }
    if (current) tokens.push(current);
    return tokens;
  }
}
```

**Step 4: Install deps and run tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm install`
Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run skills/shell/src/shellSkill.test.ts`
Expected: PASS — all 5 tests

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add skills/shell/ pnpm-lock.yaml
git commit -m "feat(skills): add Shell skill — command execution with timeout and tokenization"
```

---

### Task 2: Notes Skill

**Files:**
- Create: `skills/notes/package.json`
- Create: `skills/notes/tsconfig.json`
- Create: `skills/notes/src/index.ts`
- Create: `skills/notes/src/notesSkill.ts`
- Create: `skills/notes/src/notesSkill.test.ts`

**Step 1: Create package scaffolding**

`skills/notes/package.json`:
```json
{
  "name": "@xclaw/skill-notes",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "import": "./src/index.ts" }
  },
  "scripts": { "test": "vitest run" },
  "dependencies": {
    "@xclaw/core": "workspace:*",
    "@xclaw/sdk": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`skills/notes/tsconfig.json`: Same as shell.

`skills/notes/src/index.ts`:
```typescript
export { NotesSkill } from './notesSkill.js';
```

**Step 2: Write the failing test**

```typescript
// skills/notes/src/notesSkill.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotesSkill } from './notesSkill.js';

describe('NotesSkill', () => {
  let skill: NotesSkill;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'xclaw-notes-'));
    skill = new NotesSkill(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('manifest', () => {
    it('should have correct type and name', () => {
      expect(skill.manifest.type).toBe('skill');
      expect(skill.manifest.name).toBe('notes');
      expect(skill.manifest.permissions?.filesystem).toBeDefined();
    });
  });

  describe('tools', () => {
    it('should expose 5 tools', () => {
      expect(skill.tools).toHaveLength(5);
      const names = skill.tools.map((t) => t.name);
      expect(names).toContain('notes_create');
      expect(names).toContain('notes_read');
      expect(names).toContain('notes_list');
      expect(names).toContain('notes_search');
      expect(names).toContain('notes_delete');
    });
  });

  describe('notes_create', () => {
    it('should create a note with frontmatter', async () => {
      const result = await skill.execute('notes_create', { title: 'Test Note', content: 'Hello world', tags: ['test'] }) as any;
      expect(result.filename).toBe('test-note.md');

      const read = await skill.execute('notes_read', { filename: 'test-note.md' }) as any;
      expect(read.title).toBe('Test Note');
      expect(read.content).toContain('Hello world');
      expect(read.tags).toContain('test');
    });

    it('should handle filename collision', async () => {
      await skill.execute('notes_create', { title: 'Dup', content: 'first' });
      const result = await skill.execute('notes_create', { title: 'Dup', content: 'second' }) as any;
      expect(result.filename).toBe('dup-2.md');
    });
  });

  describe('notes_list', () => {
    it('should list all notes', async () => {
      await skill.execute('notes_create', { title: 'A', content: 'aaa' });
      await skill.execute('notes_create', { title: 'B', content: 'bbb', tags: ['work'] });
      const result = await skill.execute('notes_list', {}) as any;
      expect(result.notes).toHaveLength(2);
    });

    it('should filter by tag', async () => {
      await skill.execute('notes_create', { title: 'A', content: 'aaa', tags: ['personal'] });
      await skill.execute('notes_create', { title: 'B', content: 'bbb', tags: ['work'] });
      const result = await skill.execute('notes_list', { tag: 'work' }) as any;
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('B');
    });
  });

  describe('notes_search', () => {
    it('should find notes by content', async () => {
      await skill.execute('notes_create', { title: 'Recipe', content: 'chocolate cake recipe' });
      await skill.execute('notes_create', { title: 'Meeting', content: 'discuss project plan' });
      const result = await skill.execute('notes_search', { query: 'chocolate' }) as any;
      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('Recipe');
    });
  });

  describe('notes_delete', () => {
    it('should delete a note', async () => {
      await skill.execute('notes_create', { title: 'ToDelete', content: 'bye' });
      const del = await skill.execute('notes_delete', { filename: 'todelete.md' }) as any;
      expect(del.deleted).toBe(true);
      const list = await skill.execute('notes_list', {}) as any;
      expect(list.notes).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should return error for unknown tool', async () => {
      const result = await skill.execute('unknown', {}) as any;
      expect(result).toHaveProperty('error');
    });

    it('should return error for missing note', async () => {
      const result = await skill.execute('notes_read', { filename: 'nonexistent.md' }) as any;
      expect(result).toHaveProperty('error');
    });
  });
});
```

**Step 3: Implement NotesSkill**

```typescript
// skills/notes/src/notesSkill.ts
import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
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
```

**Step 4: Install deps and run tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm install`
Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run skills/notes/src/notesSkill.test.ts`
Expected: PASS — all 9 tests

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add skills/notes/ pnpm-lock.yaml
git commit -m "feat(skills): add Notes skill — Markdown CRUD with YAML frontmatter and search"
```

---

### Task 3: GitHub Skill

**Files:**
- Create: `skills/github/package.json`
- Create: `skills/github/tsconfig.json`
- Create: `skills/github/src/index.ts`
- Create: `skills/github/src/githubSkill.ts`
- Create: `skills/github/src/githubSkill.test.ts`

**Step 1: Create package scaffolding**

`skills/github/package.json`:
```json
{
  "name": "@xclaw/skill-github",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "import": "./src/index.ts" }
  },
  "scripts": { "test": "vitest run" },
  "dependencies": {
    "@xclaw/core": "workspace:*",
    "@xclaw/sdk": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`skills/github/tsconfig.json`: Same as shell.

`skills/github/src/index.ts`:
```typescript
export { GitHubSkill } from './githubSkill.js';
```

**Step 2: Write the failing test**

```typescript
// skills/github/src/githubSkill.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubSkill } from './githubSkill.js';
import * as cp from 'node:child_process';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(cp.execFile);

function simulateExecFile(stdout: string, stderr = '', exitCode = 0) {
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
    callback(exitCode ? new Error('fail') : null, stdout, stderr);
    return {} as any;
  });
}

describe('GitHubSkill', () => {
  const skill = new GitHubSkill();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('manifest', () => {
    it('should have correct type and name', () => {
      expect(skill.manifest.type).toBe('skill');
      expect(skill.manifest.name).toBe('github');
      expect(skill.manifest.permissions?.system).toContain('exec');
      expect(skill.manifest.permissions?.network).toContain('github.com');
    });
  });

  describe('tools', () => {
    it('should expose 5 tools', () => {
      expect(skill.tools).toHaveLength(5);
      const names = skill.tools.map((t) => t.name);
      expect(names).toContain('github_issue_create');
      expect(names).toContain('github_issue_list');
      expect(names).toContain('github_pr_create');
      expect(names).toContain('github_pr_list');
      expect(names).toContain('github_repo_list');
    });
  });

  describe('github_issue_list', () => {
    it('should call gh issue list with correct args', async () => {
      simulateExecFile(JSON.stringify([{ number: 1, title: 'Bug', state: 'OPEN', url: 'https://github.com/foo/bar/issues/1' }]));
      const result = await skill.execute('github_issue_list', { repo: 'foo/bar' }) as any;
      expect(mockExecFile).toHaveBeenCalledWith('gh', expect.arrayContaining(['issue', 'list', '--repo', 'foo/bar', '--json']), expect.any(Object), expect.any(Function));
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].title).toBe('Bug');
    });
  });

  describe('github_issue_create', () => {
    it('should call gh issue create with correct args', async () => {
      simulateExecFile(JSON.stringify({ number: 42, url: 'https://github.com/foo/bar/issues/42' }));
      const result = await skill.execute('github_issue_create', { repo: 'foo/bar', title: 'New bug', body: 'Details here' }) as any;
      expect(mockExecFile).toHaveBeenCalledWith('gh', expect.arrayContaining(['issue', 'create', '--repo', 'foo/bar', '--title', 'New bug']), expect.any(Object), expect.any(Function));
      expect(result.url).toContain('github.com');
    });
  });

  describe('github_pr_list', () => {
    it('should call gh pr list with correct args', async () => {
      simulateExecFile(JSON.stringify([{ number: 10, title: 'Fix', state: 'OPEN', url: 'https://github.com/foo/bar/pull/10' }]));
      const result = await skill.execute('github_pr_list', { repo: 'foo/bar' }) as any;
      expect(result.pullRequests).toHaveLength(1);
    });
  });

  describe('github_repo_list', () => {
    it('should call gh repo list', async () => {
      simulateExecFile(JSON.stringify([{ name: 'my-repo', url: 'https://github.com/user/my-repo' }]));
      const result = await skill.execute('github_repo_list', {}) as any;
      expect(result.repos).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should return error for unknown tool', async () => {
      const result = await skill.execute('unknown', {}) as any;
      expect(result).toHaveProperty('error');
    });

    it('should handle gh CLI failure gracefully', async () => {
      simulateExecFile('', 'gh: command not found', 1);
      const result = await skill.execute('github_issue_list', { repo: 'foo/bar' }) as any;
      expect(result).toHaveProperty('error');
    });
  });
});
```

**Step 3: Implement GitHubSkill**

```typescript
// skills/github/src/githubSkill.ts
import { execFile } from 'node:child_process';
import type { SkillPlugin, PluginManifest, ToolDefinition } from '@xclaw/core';

export class GitHubSkill implements SkillPlugin {
  manifest: PluginManifest = {
    name: 'github',
    version: '0.1.0',
    description: 'Interact with GitHub via the gh CLI',
    type: 'skill',
    permissions: { system: ['exec'], network: ['github.com'] },
  };

  tools: ToolDefinition[] = [
    { name: 'github_issue_create', description: 'Create a GitHub issue', inputSchema: { type: 'object', properties: { repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } } }, required: ['repo', 'title'] } },
    { name: 'github_issue_list', description: 'List GitHub issues', inputSchema: { type: 'object', properties: { repo: { type: 'string' }, state: { type: 'string', enum: ['open', 'closed', 'all'] }, limit: { type: 'number' } }, required: ['repo'] } },
    { name: 'github_pr_create', description: 'Create a pull request', inputSchema: { type: 'object', properties: { repo: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' }, base: { type: 'string' }, head: { type: 'string' } }, required: ['repo', 'title'] } },
    { name: 'github_pr_list', description: 'List pull requests', inputSchema: { type: 'object', properties: { repo: { type: 'string' }, state: { type: 'string', enum: ['open', 'closed', 'all'] }, limit: { type: 'number' } }, required: ['repo'] } },
    { name: 'github_repo_list', description: 'List repositories', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
  ];

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'github_issue_create': return this.issueCreate(args);
      case 'github_issue_list': return this.issueList(args);
      case 'github_pr_create': return this.prCreate(args);
      case 'github_pr_list': return this.prList(args);
      case 'github_repo_list': return this.repoList(args);
      default: return { error: `Unknown tool: ${toolName}` };
    }
  }

  private async issueCreate(args: Record<string, unknown>) {
    const ghArgs = ['issue', 'create', '--repo', args.repo as string, '--title', args.title as string];
    if (args.body) ghArgs.push('--body', args.body as string);
    if (args.labels && Array.isArray(args.labels)) {
      for (const label of args.labels as string[]) ghArgs.push('--label', label);
    }
    const result = await this.runGh(ghArgs);
    if (result.error) return result;
    return this.parseJson(result.stdout);
  }

  private async issueList(args: Record<string, unknown>) {
    const ghArgs = ['issue', 'list', '--repo', args.repo as string, '--json', 'number,title,state,url'];
    if (args.state) ghArgs.push('--state', args.state as string);
    ghArgs.push('--limit', String((args.limit as number) ?? 10));
    const result = await this.runGh(ghArgs);
    if (result.error) return result;
    return { issues: this.parseJson(result.stdout) };
  }

  private async prCreate(args: Record<string, unknown>) {
    const ghArgs = ['pr', 'create', '--repo', args.repo as string, '--title', args.title as string];
    if (args.body) ghArgs.push('--body', args.body as string);
    if (args.base) ghArgs.push('--base', args.base as string);
    if (args.head) ghArgs.push('--head', args.head as string);
    const result = await this.runGh(ghArgs);
    if (result.error) return result;
    return this.parseJson(result.stdout);
  }

  private async prList(args: Record<string, unknown>) {
    const ghArgs = ['pr', 'list', '--repo', args.repo as string, '--json', 'number,title,state,url'];
    if (args.state) ghArgs.push('--state', args.state as string);
    ghArgs.push('--limit', String((args.limit as number) ?? 10));
    const result = await this.runGh(ghArgs);
    if (result.error) return result;
    return { pullRequests: this.parseJson(result.stdout) };
  }

  private async repoList(args: Record<string, unknown>) {
    const ghArgs = ['repo', 'list', '--json', 'name,url', '--limit', String((args.limit as number) ?? 20)];
    const result = await this.runGh(ghArgs);
    if (result.error) return result;
    return { repos: this.parseJson(result.stdout) };
  }

  private runGh(args: string[]): Promise<{ stdout: string; error?: string }> {
    return new Promise((resolve) => {
      execFile('gh', args, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          resolve({ stdout: '', error: stderr?.toString() || error.message });
          return;
        }
        resolve({ stdout: stdout?.toString() ?? '' });
      });
    });
  }

  private parseJson(raw: string): unknown {
    try { return JSON.parse(raw); } catch { return { raw }; }
  }
}
```

**Step 4: Install deps and run tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm install`
Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run skills/github/src/githubSkill.test.ts`
Expected: PASS — all 8 tests

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add skills/github/ pnpm-lock.yaml
git commit -m "feat(skills): add GitHub skill — issues, PRs, repos via gh CLI"
```

---

### Task 4: Web Search Skill

**Files:**
- Create: `skills/web-search/package.json`
- Create: `skills/web-search/tsconfig.json`
- Create: `skills/web-search/src/index.ts`
- Create: `skills/web-search/src/webSearchSkill.ts`
- Create: `skills/web-search/src/webSearchSkill.test.ts`

**Step 1: Create package scaffolding**

`skills/web-search/package.json`:
```json
{
  "name": "@xclaw/skill-web-search",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "import": "./src/index.ts" }
  },
  "scripts": { "test": "vitest run" },
  "dependencies": {
    "@xclaw/core": "workspace:*",
    "@xclaw/sdk": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

`skills/web-search/tsconfig.json`: Same as shell.

`skills/web-search/src/index.ts`:
```typescript
export { WebSearchSkill } from './webSearchSkill.js';
```

**Step 2: Write the failing test**

```typescript
// skills/web-search/src/webSearchSkill.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSearchSkill } from './webSearchSkill.js';

describe('WebSearchSkill', () => {
  const skill = new WebSearchSkill();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('manifest', () => {
    it('should have correct type and name', () => {
      expect(skill.manifest.type).toBe('skill');
      expect(skill.manifest.name).toBe('web-search');
      expect(skill.manifest.permissions?.network).toContain('*');
    });
  });

  describe('tools', () => {
    it('should expose web_fetch and web_search', () => {
      expect(skill.tools).toHaveLength(2);
      const names = skill.tools.map((t) => t.name);
      expect(names).toContain('web_fetch');
      expect(names).toContain('web_search');
    });
  });

  describe('web_fetch', () => {
    it('should fetch a URL and extract text', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('<html><head><title>Test Page</title></head><body><p>Hello world</p></body></html>'),
      }));

      const result = await skill.execute('web_fetch', { url: 'https://example.com' }) as any;
      expect(result.url).toBe('https://example.com');
      expect(result.title).toBe('Test Page');
      expect(result.content).toContain('Hello world');
    });

    it('should truncate long content', async () => {
      const longText = 'x'.repeat(20000);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`<html><body>${longText}</body></html>`),
      }));

      const result = await skill.execute('web_fetch', { url: 'https://example.com', maxLength: 100 }) as any;
      expect(result.content.length).toBeLessThanOrEqual(100);
    });

    it('should handle fetch failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await skill.execute('web_fetch', { url: 'https://example.com' }) as any;
      expect(result).toHaveProperty('error');
    });

    it('should handle non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
      }));

      const result = await skill.execute('web_fetch', { url: 'https://example.com' }) as any;
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('404');
    });
  });

  describe('web_search', () => {
    it('should search and return results', async () => {
      const html = `<html><body>
        <a class="result__a" href="https://example.com/1">Result One</a>
        <a class="result__snippet">Snippet one text</a>
        <a class="result__a" href="https://example.com/2">Result Two</a>
        <a class="result__snippet">Snippet two text</a>
      </body></html>`;
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(html),
      }));

      const result = await skill.execute('web_search', { query: 'test query' }) as any;
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should return error for unknown tool', async () => {
      const result = await skill.execute('unknown', {}) as any;
      expect(result).toHaveProperty('error');
    });
  });
});
```

**Step 3: Implement WebSearchSkill**

```typescript
// skills/web-search/src/webSearchSkill.ts
import type { SkillPlugin, PluginManifest, ToolDefinition } from '@xclaw/core';

export class WebSearchSkill implements SkillPlugin {
  manifest: PluginManifest = {
    name: 'web-search',
    version: '0.1.0',
    description: 'Fetch web pages and search the web',
    type: 'skill',
    permissions: { network: ['*'] },
  };

  tools: ToolDefinition[] = [
    { name: 'web_fetch', description: 'Fetch a URL and extract readable text content', inputSchema: { type: 'object', properties: { url: { type: 'string' }, maxLength: { type: 'number' } }, required: ['url'] } },
    { name: 'web_search', description: 'Search the web and return results', inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'number' } }, required: ['query'] } },
  ];

  async execute(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'web_fetch': return this.webFetch(args);
      case 'web_search': return this.webSearch(args);
      default: return { error: `Unknown tool: ${toolName}` };
    }
  }

  private async webFetch(args: Record<string, unknown>) {
    const url = args.url as string;
    const maxLength = (args.maxLength as number) ?? 10000;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'xclaw/0.1 (bot)' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return { error: `HTTP ${response.status}` };
      }

      const html = await response.text();
      const title = this.extractTitle(html);
      let content = this.htmlToText(html);
      if (content.length > maxLength) content = content.slice(0, maxLength);

      return { url, title, content };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  private async webSearch(args: Record<string, unknown>) {
    const query = args.query as string;
    const limit = (args.limit as number) ?? 5;

    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'xclaw/0.1 (bot)' },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return { error: `Search failed: HTTP ${response.status}` };
      }

      const html = await response.text();
      const results = this.parseDdgResults(html, limit);
      return { results };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? this.decodeEntities(match[1].trim()) : '';
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private decodeEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  private parseDdgResults(html: string, limit: number): { title: string; url: string; snippet: string }[] {
    const results: { title: string; url: string; snippet: string }[] = [];
    const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const links: { url: string; title: string }[] = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      links.push({ url: this.decodeEntities(match[1]), title: this.htmlToText(match[2]) });
    }

    const snippets: string[] = [];
    while ((match = snippetRegex.exec(html)) !== null) {
      snippets.push(this.htmlToText(match[1]));
    }

    for (let i = 0; i < Math.min(links.length, limit); i++) {
      results.push({
        title: links[i].title,
        url: links[i].url,
        snippet: snippets[i] ?? '',
      });
    }

    return results;
  }
}
```

**Step 4: Install deps and run tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm install`
Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run skills/web-search/src/webSearchSkill.test.ts`
Expected: PASS — all 7 tests

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add skills/web-search/ pnpm-lock.yaml
git commit -m "feat(skills): add Web Search skill — URL fetching and DuckDuckGo search"
```

---

## Summary

After completing all 4 tasks, Phase 7 Built-in Skills delivers:

- **Shell Skill**: Command execution with tokenization, timeout, error handling (5 tests)
- **Notes Skill**: Markdown CRUD with YAML frontmatter, tag filtering, search (9 tests)
- **GitHub Skill**: Issues, PRs, repos via `gh` CLI with JSON parsing (8 tests)
- **Web Search Skill**: URL fetching with HTML-to-text, DuckDuckGo search (7 tests)
- **Total**: 4 skill packages, 29 new tests
