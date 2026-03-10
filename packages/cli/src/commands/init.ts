import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { stringify as yamlStringify } from 'yaml';

export interface InitAnswers {
  provider: string;
  apiKey: string;
  model: string;
}

export function buildConfigYaml(answers: InitAnswers): string {
  const config = {
    version: '0.1.0',
    providers: [
      {
        name: answers.provider,
        type: answers.provider,
        apiKeyRef: `XCLAW_${answers.provider.toUpperCase()}_KEY`,
        default: true,
      },
    ],
    router: {
      defaultProvider: answers.provider,
      defaultModel: answers.model,
    },
    channels: [],
    gateway: { host: '127.0.0.1', port: 18789 },
  };
  return yamlStringify(config);
}

export async function initCommand(answers: InitAnswers): Promise<string> {
  const xclawDir = join(homedir(), '.xclaw');
  if (!existsSync(xclawDir)) await mkdir(xclawDir, { recursive: true });

  const configPath = join(xclawDir, 'xclaw.config.yaml');
  if (existsSync(configPath)) {
    return `Config already exists at ${configPath}. Delete it first to re-initialize.`;
  }

  const yaml = buildConfigYaml(answers);
  await writeFile(configPath, yaml, 'utf-8');
  return `Config written to ${configPath}`;
}
