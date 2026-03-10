import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml, stringify as yamlStringify } from 'yaml';

export function resolveConfigPath(): string {
  return process.env.XCLAW_CONFIG ?? join(homedir(), '.xclaw', 'xclaw.config.yaml');
}

export async function configGet(key: string): Promise<string> {
  const path = resolveConfigPath();
  try {
    const raw = await readFile(path, 'utf-8');
    const config = parseYaml(raw) as Record<string, unknown>;
    const value = getNestedValue(config, key);
    if (value === undefined) return `Key "${key}" not found.`;
    return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  } catch {
    return 'Config file not found. Run "xclaw init".';
  }
}

export async function configSet(key: string, value: string): Promise<string> {
  const path = resolveConfigPath();
  let config: Record<string, unknown>;
  try {
    const raw = await readFile(path, 'utf-8');
    config = parseYaml(raw) as Record<string, unknown>;
  } catch {
    return 'Config file not found. Run "xclaw init".';
  }

  setNestedValue(config, key, value);
  await writeFile(path, yamlStringify(config), 'utf-8');
  return `Set ${key} = ${value}`;
}

export async function configList(): Promise<string> {
  const path = resolveConfigPath();
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return 'Config file not found. Run "xclaw init".';
  }
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: string): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in current) || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]] as Record<string, unknown>;
  }
  if (value === 'true') current[keys[keys.length - 1]] = true;
  else if (value === 'false') current[keys[keys.length - 1]] = false;
  else if (!isNaN(Number(value))) current[keys[keys.length - 1]] = Number(value);
  else current[keys[keys.length - 1]] = value;
}
