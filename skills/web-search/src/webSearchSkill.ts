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
