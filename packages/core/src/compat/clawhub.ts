const DEFAULT_BASE_URL = 'https://clawhub.openclaw.ai/api/v1';

export interface ClawHubSearchResult {
  results: ClawHubSkillSummary[];
  total: number;
}

export interface ClawHubSkillSummary {
  name: string;
  version: string;
  description: string;
  downloads: number;
}

export interface ClawHubSkillInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  downloads: number;
  readme: string;
}

export interface ClawHubClientOptions {
  baseUrl?: string;
}

export class ClawHubClient {
  private readonly baseUrl: string;

  constructor(options?: ClawHubClientOptions) {
    this.baseUrl = (options?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  async search(query: string): Promise<ClawHubSearchResult> {
    const url = `${this.baseUrl}/skills?q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ClawHub API error (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as ClawHubSearchResult;
  }

  async getSkillInfo(name: string): Promise<ClawHubSkillInfo> {
    const url = `${this.baseUrl}/skills/${encodeURIComponent(name)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ClawHub API error (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as ClawHubSkillInfo;
  }

  async getDownloadUrl(name: string, version: string): Promise<string> {
    const url = `${this.baseUrl}/skills/${encodeURIComponent(name)}/versions/${encodeURIComponent(version)}/download`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ClawHub API error (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { tarball: string };
    return data.tarball;
  }
}
