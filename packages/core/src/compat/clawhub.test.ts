import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClawHubClient } from './clawhub.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ClawHubClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should search for skills', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { name: 'github-helper', version: '2.0.0', description: 'GitHub management', downloads: 1500 },
          { name: 'github-actions', version: '1.0.0', description: 'GitHub Actions', downloads: 800 },
        ],
        total: 2,
      }),
    });

    const client = new ClawHubClient();
    const results = await client.search('github');

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(results.results).toHaveLength(2);
    expect(results.results[0].name).toBe('github-helper');
  });

  it('should get skill details', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'github-helper',
        version: '2.0.0',
        description: 'GitHub management',
        author: 'community',
        downloads: 1500,
        readme: '# GitHub Helper\n...',
      }),
    });

    const client = new ClawHubClient();
    const detail = await client.getSkillInfo('github-helper');

    expect(detail.name).toBe('github-helper');
    expect(detail.version).toBe('2.0.0');
  });

  it('should download a skill tarball URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tarball: 'https://clawhub.openclaw.ai/packages/github-helper-2.0.0.tgz',
      }),
    });

    const client = new ClawHubClient();
    const url = await client.getDownloadUrl('github-helper', '2.0.0');

    expect(url).toContain('github-helper');
  });

  it('should handle API errors gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    const client = new ClawHubClient();
    await expect(client.search('nonexistent')).rejects.toThrow('ClawHub API error');
  });

  it('should use custom base URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], total: 0 }),
    });

    const client = new ClawHubClient({ baseUrl: 'https://custom.hub.example.com/api' });
    await client.search('test');

    expect(mockFetch.mock.calls[0][0]).toContain('custom.hub.example.com');
  });
});
