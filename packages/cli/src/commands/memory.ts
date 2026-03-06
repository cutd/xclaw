export interface DisplayEntry {
  content: string;
  tags: string[];
  timestamp: number;
}

export function formatMemoryEntries(entries: DisplayEntry[]): string {
  if (entries.length === 0) {
    return 'No memories found.';
  }

  const lines = entries.map((e) => {
    const date = new Date(e.timestamp).toISOString().split('T')[0];
    const tags = e.tags.length > 0 ? ` [${e.tags.join(', ')}]` : '';
    return `  ${date}${tags}  ${e.content}`;
  });
  return `${entries.length} memory(s):\n${lines.join('\n')}`;
}

export function formatMemoryFile(content: string): string {
  return content;
}
