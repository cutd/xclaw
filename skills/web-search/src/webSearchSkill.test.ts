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
