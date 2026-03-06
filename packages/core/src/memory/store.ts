import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';

export interface StoreEntry {
  content: string;
  tags: string[];
  timestamp: number;
}

const MEMORY_HEADER = '# Memory\n\n> Long-term memory entries for xclaw.\n\n';
const ENTRY_SEPARATOR = '\n---\n\n';

export class MemoryStore {
  private readonly dir: string;
  private readonly memoryPath: string;

  constructor(dir: string) {
    this.dir = dir;
    this.memoryPath = join(dir, 'MEMORY.md');
  }

  async initialize(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      await access(this.memoryPath);
    } catch {
      await writeFile(this.memoryPath, MEMORY_HEADER, 'utf-8');
    }
  }

  async append(entry: StoreEntry): Promise<void> {
    const existing = await readFile(this.memoryPath, 'utf-8');
    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    const tagStr = entry.tags.length > 0 ? ` [${entry.tags.join(', ')}]` : '';
    const block = `### ${date}${tagStr}\n\n${entry.content}\n`;
    const separator = existing.trimEnd().endsWith('---') || existing === MEMORY_HEADER ? '' : ENTRY_SEPARATOR;
    await writeFile(this.memoryPath, existing.trimEnd() + '\n' + separator + block, 'utf-8');
  }

  async readAll(): Promise<StoreEntry[]> {
    const content = await readFile(this.memoryPath, 'utf-8');
    const entries: StoreEntry[] = [];

    // Split by ### headings
    const blocks = content.split(/^### /m).slice(1);
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const headerLine = lines[0] ?? '';
      const body = lines.slice(1).join('\n').trim().replace(/\n*---\s*$/, '').trim();
      if (!body) continue;

      // Parse header: "2026-03-06 [tag1, tag2]"
      const tagMatch = headerLine.match(/\[([^\]]+)\]/);
      const tags = tagMatch ? tagMatch[1].split(',').map((t) => t.trim()) : [];
      const dateStr = headerLine.replace(/\s*\[.*\]/, '').trim();
      const timestamp = new Date(dateStr).getTime() || Date.now();

      entries.push({ content: body, tags, timestamp });
    }

    return entries;
  }

  async writeDailyLog(date: string, content: string): Promise<void> {
    const logPath = join(this.dir, `${date}.md`);
    let existing = '';
    try {
      existing = await readFile(logPath, 'utf-8');
    } catch {
      existing = `# Daily Log — ${date}\n\n`;
    }
    const timestamp = new Date().toISOString().split('T')[1]?.slice(0, 5) ?? '00:00';
    await writeFile(logPath, existing + `**${timestamp}** ${content}\n\n`, 'utf-8');
  }
}
