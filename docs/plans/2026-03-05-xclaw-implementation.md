# xclaw Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the foundational Phase 1 of xclaw — a working monorepo with core types, plugin system, security layer, LLM provider abstraction, smart router, sandbox engine, and a CLI channel that can hold a conversation with an LLM.

**Architecture:** Layered gateway (security core → smart router → execution layer) with plugin system for channels/skills, agent dispatching by task complexity, and lightweight sandboxing. Phase 1 delivers a vertical slice: CLI channel → security → router → LLM provider → response.

**Tech Stack:** TypeScript 5.x ESM, Node.js >= 22, pnpm monorepo, Vitest, tsup, commander (CLI)

---

## Phase 1 Overview

Phase 1 delivers a working vertical slice:

```
CLI input → Security Core (auth + audit) → Smart Router (task analysis + model selection)
  → LLM Provider (Anthropic) → Context Manager → Response back to CLI
```

Tasks are ordered bottom-up: shared types first, then each layer, then wiring them together.

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.json`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/providers/package.json`
- Create: `packages/providers/tsconfig.json`
- Create: `packages/sdk/package.json`
- Create: `packages/sdk/tsconfig.json`

**Step 1: Create root package.json with workspace config**

```json
{
  "name": "xclaw",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "build": "pnpm -r run build",
    "test": "vitest",
    "lint": "oxlint .",
    "dev": "pnpm --filter @xclaw/cli run dev"
  }
}
```

**Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
  - "channels/*"
  - "skills/*"
```

**Step 3: Create tsconfig.base.json (shared compiler options)**

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

**Step 4: Create root tsconfig.json with project references**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "references": [
    { "path": "packages/core" },
    { "path": "packages/cli" },
    { "path": "packages/providers" },
    { "path": "packages/sdk" }
  ]
}
```

**Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['packages/*/src/**/*.test.ts', 'channels/*/src/**/*.test.ts'],
  },
});
```

**Step 6: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.env
.env.*
!.env.example
coverage/
```

**Step 7: Create .npmrc**

```
shamefully-hoist=false
strict-peer-dependencies=false
```

**Step 8: Create packages/core/package.json**

```json
{
  "name": "@xclaw/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./*": "./dist/*.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 9: Create packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**Step 10: Create packages/cli/package.json**

```json
{
  "name": "@xclaw/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "xclaw": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@xclaw/core": "workspace:*",
    "@xclaw/providers": "workspace:*",
    "commander": "^13.0.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 11: Create packages/cli/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" },
    { "path": "../providers" }
  ]
}
```

**Step 12: Create packages/providers/package.json**

```json
{
  "name": "@xclaw/providers",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./*": "./dist/*.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run"
  },
  "dependencies": {
    "@xclaw/core": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 13: Create packages/providers/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" }
  ]
}
```

**Step 14: Create packages/sdk/package.json**

```json
{
  "name": "@xclaw/sdk",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./*": "./dist/*.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run"
  },
  "dependencies": {
    "@xclaw/core": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 15: Create packages/sdk/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../core" }
  ]
}
```

**Step 16: Install dependencies**

Run: `pnpm install`
Expected: Dependencies installed, lockfile created.

**Step 17: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo with core, cli, providers, sdk packages"
```

---

### Task 2: Core Types & Message Format

**Files:**
- Create: `packages/core/src/types/message.ts`
- Create: `packages/core/src/types/config.ts`
- Create: `packages/core/src/types/plugin.ts`
- Create: `packages/core/src/types/error.ts`
- Create: `packages/core/src/types/security.ts`
- Create: `packages/core/src/types/index.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/types/message.test.ts`

**Step 1: Write the failing test for message types**

```typescript
// packages/core/src/types/message.test.ts
import { describe, it, expect } from 'vitest';
import type { UnifiedMessage, MessageSource, MessageContent } from './message.js';

describe('UnifiedMessage type', () => {
  it('should accept a valid unified message', () => {
    const msg: UnifiedMessage = {
      id: 'msg-001',
      source: { channel: 'telegram', userId: 'user-123', sessionId: 'sess-456' },
      content: { type: 'text', text: 'Hello xclaw' },
      timestamp: Date.now(),
    };
    expect(msg.id).toBe('msg-001');
    expect(msg.source.channel).toBe('telegram');
    expect(msg.content.type).toBe('text');
  });

  it('should accept a message with metadata', () => {
    const msg: UnifiedMessage = {
      id: 'msg-002',
      source: { channel: 'cli', userId: 'local', sessionId: 'cli-sess' },
      content: { type: 'text', text: 'test' },
      timestamp: Date.now(),
      metadata: { replyTo: 'msg-001' },
    };
    expect(msg.metadata?.replyTo).toBe('msg-001');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/types/message.test.ts`
Expected: FAIL — cannot find module `./message.js`

**Step 3: Create message types**

```typescript
// packages/core/src/types/message.ts
export interface MessageSource {
  channel: string;
  userId: string;
  sessionId: string;
  raw?: unknown;
}

export interface MessageContent {
  type: 'text' | 'image' | 'file' | 'audio' | 'command';
  text?: string;
  url?: string;
  mimeType?: string;
  data?: Uint8Array;
}

export interface UnifiedMessage {
  id: string;
  source: MessageSource;
  content: MessageContent;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface OutgoingMessage {
  targetChannel: string;
  targetUserId: string;
  targetSessionId: string;
  content: MessageContent;
  replyToMessageId?: string;
  metadata?: Record<string, unknown>;
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/types/message.test.ts`
Expected: PASS

**Step 5: Create config types**

```typescript
// packages/core/src/types/config.ts
export interface XClawConfig {
  version: string;
  providers: ProviderConfig[];
  channels: ChannelConfig[];
  security: SecurityConfig;
  router: RouterConfig;
  sandbox: SandboxConfig;
  budget: BudgetConfig;
}

export interface ProviderConfig {
  name: string;
  type: 'anthropic' | 'openai' | 'google' | 'ollama' | 'custom';
  apiKeyRef?: string;
  baseUrl?: string;
  models?: string[];
  default?: boolean;
}

export interface ChannelConfig {
  name: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface SecurityConfig {
  promptLevel: 'none' | 'danger' | 'warning' | 'notice' | 'info';
  trustedSkills: string[];
  approvalRules: ApprovalRule[];
}

export interface ApprovalRule {
  operation: string;
  threshold: string;
  action: 'confirm' | 'always_allow';
}

export interface RouterConfig {
  defaultProvider: string;
  defaultModel: string;
  tierModels: Record<string, string>;
  contextWindow: number;
  summarizeAfterTurns: number;
}

export interface SandboxConfig {
  defaultMode: 'ephemeral' | 'persistent';
  backend: 'auto' | 'bwrap' | 'macSandbox' | 'vmIsolate';
  memoryLimitMB: number;
  timeoutSeconds: number;
  networkWhitelist: string[];
  persistDir: string;
}

export interface BudgetConfig {
  monthlyTokenLimit: number;
  warningThreshold: number;
  perChannelLimits: Record<string, number>;
}
```

**Step 6: Create plugin types**

```typescript
// packages/core/src/types/plugin.ts
import type { UnifiedMessage, OutgoingMessage } from './message.js';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  type: 'channel' | 'skill' | 'provider';
  compatibility?: {
    xclaw?: string;
    openclaw?: string;
    mcp?: boolean;
    claudeCode?: boolean;
  };
  permissions?: {
    network?: string[];
    filesystem?: string[];
    system?: string[];
  };
}

export interface ChannelPlugin {
  manifest: PluginManifest;
  onLoad(): Promise<void>;
  onUnload(): Promise<void>;
  onMessage(handler: (msg: UnifiedMessage) => Promise<void>): void;
  send(msg: OutgoingMessage): Promise<void>;
}

export interface SkillPlugin {
  manifest: PluginManifest;
  tools: ToolDefinition[];
  execute(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
```

**Step 7: Create error types**

```typescript
// packages/core/src/types/error.ts
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'fatal';

export class XClawError extends Error {
  public readonly code: string;
  public readonly severity: ErrorSeverity;
  public readonly suggestion: string;
  public readonly docLink?: string;
  public readonly context?: Record<string, unknown>;

  constructor(params: {
    code: string;
    message: string;
    severity: ErrorSeverity;
    suggestion: string;
    docLink?: string;
    context?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = 'XClawError';
    this.code = params.code;
    this.severity = params.severity;
    this.suggestion = params.suggestion;
    this.docLink = params.docLink;
    this.context = params.context;
  }

  toUserFriendly(): string {
    let output = `[${this.severity.toUpperCase()}] ${this.message} (${this.code})`;
    output += `\n  建议: ${this.suggestion}`;
    if (this.docLink) {
      output += `\n  文档: ${this.docLink}`;
    }
    return output;
  }
}
```

**Step 8: Create security types**

```typescript
// packages/core/src/types/security.ts
export type RiskLevel = 'info' | 'notice' | 'warning' | 'danger';

export interface RiskAssessment {
  level: RiskLevel;
  operation: string;
  description: string;
  details?: string[];
  mitigations?: RiskMitigation[];
}

export interface RiskMitigation {
  label: string;
  description: string;
  action: 'sandbox' | 'restrict_network' | 'restrict_fs' | 'none';
}

export interface ApprovalRequest {
  id: string;
  assessment: RiskAssessment;
  options: ApprovalOption[];
  timeoutMs: number;
  createdAt: number;
}

export interface ApprovalOption {
  key: string;
  label: string;
  description: string;
  mitigations?: RiskMitigation[];
}

export type ApprovalResponse = {
  requestId: string;
  chosenOption: string;
  timestamp: number;
};

export type SecretLevel = 'low' | 'medium' | 'high';

export interface AuditEntry {
  id: string;
  timestamp: number;
  operation: string;
  riskLevel: RiskLevel;
  userId: string;
  sessionId: string;
  approved: boolean;
  details?: Record<string, unknown>;
}
```

**Step 9: Create types barrel export**

```typescript
// packages/core/src/types/index.ts
export * from './message.js';
export * from './config.js';
export * from './plugin.js';
export * from './error.js';
export * from './security.js';
```

**Step 10: Create core barrel export**

```typescript
// packages/core/src/index.ts
export * from './types/index.js';
```

**Step 11: Run all tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run`
Expected: All tests PASS

**Step 12: Commit**

```bash
git add packages/core/src/
git commit -m "feat(core): add unified message, config, plugin, error, and security types"
```

---

### Task 3: Event Bus

**Files:**
- Create: `packages/core/src/events/eventBus.ts`
- Create: `packages/core/src/events/index.ts`
- Test: `packages/core/src/events/eventBus.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/events/eventBus.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './eventBus.js';

describe('EventBus', () => {
  it('should emit and receive events', async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('test', handler);
    await bus.emit('test', { data: 'hello' });
    expect(handler).toHaveBeenCalledWith({ data: 'hello' });
  });

  it('should support multiple handlers', async () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on('test', h1);
    bus.on('test', h2);
    await bus.emit('test', 'payload');
    expect(h1).toHaveBeenCalledWith('payload');
    expect(h2).toHaveBeenCalledWith('payload');
  });

  it('should remove handler with off()', async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('test', handler);
    bus.off('test', handler);
    await bus.emit('test', 'payload');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should support once()', async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once('test', handler);
    await bus.emit('test', 'first');
    await bus.emit('test', 'second');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('first');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/events/eventBus.test.ts`
Expected: FAIL

**Step 3: Implement EventBus**

```typescript
// packages/core/src/events/eventBus.ts
type Handler = (payload: unknown) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: Handler): void {
    this.handlers.get(event)?.delete(handler);
  }

  once(event: string, handler: Handler): void {
    const wrapper: Handler = async (payload) => {
      this.off(event, wrapper);
      await handler(payload);
    };
    this.on(event, wrapper);
  }

  async emit(event: string, payload?: unknown): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    const promises = [...handlers].map((h) => h(payload));
    await Promise.all(promises);
  }
}
```

**Step 4: Create barrel export**

```typescript
// packages/core/src/events/index.ts
export { EventBus } from './eventBus.js';
```

**Step 5: Update core index to export events**

Add to `packages/core/src/index.ts`:
```typescript
export * from './events/index.js';
```

**Step 6: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/events/eventBus.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/core/src/events/ packages/core/src/index.ts
git commit -m "feat(core): add typed event bus for inter-layer communication"
```

---

### Task 4: Plugin System

**Files:**
- Create: `packages/core/src/plugin/registry.ts`
- Create: `packages/core/src/plugin/loader.ts`
- Create: `packages/core/src/plugin/lifecycle.ts`
- Create: `packages/core/src/plugin/index.ts`
- Test: `packages/core/src/plugin/registry.test.ts`
- Test: `packages/core/src/plugin/loader.test.ts`

**Step 1: Write failing test for PluginRegistry**

```typescript
// packages/core/src/plugin/registry.test.ts
import { describe, it, expect } from 'vitest';
import { PluginRegistry } from './registry.js';
import type { PluginManifest } from '../types/plugin.js';

describe('PluginRegistry', () => {
  const manifest: PluginManifest = {
    name: 'test-plugin',
    version: '1.0.0',
    description: 'A test plugin',
    type: 'skill',
  };

  it('should register and retrieve a plugin', () => {
    const registry = new PluginRegistry();
    registry.register(manifest, { execute: () => {} });
    expect(registry.get('test-plugin')).toBeDefined();
    expect(registry.get('test-plugin')!.manifest.name).toBe('test-plugin');
  });

  it('should list plugins by type', () => {
    const registry = new PluginRegistry();
    registry.register(manifest, { execute: () => {} });
    registry.register({ ...manifest, name: 'channel-x', type: 'channel' }, { send: () => {} });
    expect(registry.listByType('skill')).toHaveLength(1);
    expect(registry.listByType('channel')).toHaveLength(1);
  });

  it('should unregister a plugin', () => {
    const registry = new PluginRegistry();
    registry.register(manifest, { execute: () => {} });
    registry.unregister('test-plugin');
    expect(registry.get('test-plugin')).toBeUndefined();
  });

  it('should detect duplicate registration', () => {
    const registry = new PluginRegistry();
    registry.register(manifest, { execute: () => {} });
    expect(() => registry.register(manifest, { execute: () => {} })).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/plugin/registry.test.ts`
Expected: FAIL

**Step 3: Implement PluginRegistry**

```typescript
// packages/core/src/plugin/registry.ts
import type { PluginManifest } from '../types/plugin.js';
import { XClawError } from '../types/error.js';

export interface RegisteredPlugin {
  manifest: PluginManifest;
  instance: unknown;
  status: 'registered' | 'loaded' | 'active' | 'error';
}

export class PluginRegistry {
  private plugins = new Map<string, RegisteredPlugin>();

  register(manifest: PluginManifest, instance: unknown): void {
    if (this.plugins.has(manifest.name)) {
      throw new XClawError({
        code: 'PLUGIN.DUPLICATE',
        message: `Plugin "${manifest.name}" is already registered`,
        severity: 'error',
        suggestion: `Unregister the existing plugin first or use a different name`,
      });
    }
    this.plugins.set(manifest.name, { manifest, instance, status: 'registered' });
  }

  get(name: string): RegisteredPlugin | undefined {
    return this.plugins.get(name);
  }

  unregister(name: string): boolean {
    return this.plugins.delete(name);
  }

  listByType(type: PluginManifest['type']): RegisteredPlugin[] {
    return [...this.plugins.values()].filter((p) => p.manifest.type === type);
  }

  listAll(): RegisteredPlugin[] {
    return [...this.plugins.values()];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/plugin/registry.test.ts`
Expected: PASS

**Step 5: Write failing test for PluginLoader**

```typescript
// packages/core/src/plugin/loader.test.ts
import { describe, it, expect } from 'vitest';
import { detectPluginFormat } from './loader.js';

describe('detectPluginFormat', () => {
  it('should detect xclaw native format', () => {
    const pkg = { name: 'test', keywords: ['xclaw-plugin'] };
    expect(detectPluginFormat(pkg)).toBe('xclaw');
  });

  it('should detect openclaw format', () => {
    const pkg = { name: 'test', keywords: ['openclaw-extension'] };
    expect(detectPluginFormat(pkg)).toBe('openclaw');
  });

  it('should detect mcp format from engines', () => {
    const pkg = { name: 'test', keywords: [], engines: { mcp: '>=1.0.0' } };
    expect(detectPluginFormat(pkg)).toBe('mcp');
  });

  it('should return unknown for unrecognized format', () => {
    const pkg = { name: 'test' };
    expect(detectPluginFormat(pkg)).toBe('unknown');
  });
});
```

**Step 6: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/plugin/loader.test.ts`
Expected: FAIL

**Step 7: Implement PluginLoader with format detection**

```typescript
// packages/core/src/plugin/loader.ts
export type PluginFormat = 'xclaw' | 'openclaw' | 'mcp' | 'claudeCode' | 'unknown';

export function detectPluginFormat(pkg: Record<string, unknown>): PluginFormat {
  const keywords = (pkg.keywords as string[]) ?? [];

  if (keywords.includes('xclaw-plugin') || keywords.includes('xclaw-skill') || keywords.includes('xclaw-channel')) {
    return 'xclaw';
  }
  if (keywords.includes('openclaw-extension') || keywords.includes('openclaw-skill')) {
    return 'openclaw';
  }

  const engines = pkg.engines as Record<string, string> | undefined;
  if (engines?.mcp) {
    return 'mcp';
  }

  return 'unknown';
}
```

**Step 8: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/plugin/loader.test.ts`
Expected: PASS

**Step 9: Create lifecycle manager stub**

```typescript
// packages/core/src/plugin/lifecycle.ts
import type { RegisteredPlugin } from './registry.js';

export class PluginLifecycle {
  async activate(plugin: RegisteredPlugin): Promise<void> {
    if (typeof (plugin.instance as Record<string, unknown>).onLoad === 'function') {
      await (plugin.instance as { onLoad: () => Promise<void> }).onLoad();
    }
    plugin.status = 'active';
  }

  async deactivate(plugin: RegisteredPlugin): Promise<void> {
    if (typeof (plugin.instance as Record<string, unknown>).onUnload === 'function') {
      await (plugin.instance as { onUnload: () => Promise<void> }).onUnload();
    }
    plugin.status = 'registered';
  }
}
```

**Step 10: Create barrel export**

```typescript
// packages/core/src/plugin/index.ts
export { PluginRegistry } from './registry.js';
export { detectPluginFormat } from './loader.js';
export type { PluginFormat } from './loader.js';
export { PluginLifecycle } from './lifecycle.js';
```

**Step 11: Update core index**

Add to `packages/core/src/index.ts`:
```typescript
export * from './plugin/index.js';
```

**Step 12: Run all tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run`
Expected: All PASS

**Step 13: Commit**

```bash
git add packages/core/src/plugin/ packages/core/src/index.ts
git commit -m "feat(core): add plugin registry, format detector, and lifecycle manager"
```

---

### Task 5: Security Core — Risk Assessment & Approval Engine

**Files:**
- Create: `packages/core/src/security/riskAssessor.ts`
- Create: `packages/core/src/security/approvalEngine.ts`
- Create: `packages/core/src/security/auditLog.ts`
- Create: `packages/core/src/security/index.ts`
- Test: `packages/core/src/security/riskAssessor.test.ts`
- Test: `packages/core/src/security/approvalEngine.test.ts`

**Step 1: Write failing test for RiskAssessor**

```typescript
// packages/core/src/security/riskAssessor.test.ts
import { describe, it, expect } from 'vitest';
import { RiskAssessor } from './riskAssessor.js';

describe('RiskAssessor', () => {
  it('should rate file read as INFO', () => {
    const assessor = new RiskAssessor();
    const result = assessor.assess({ operation: 'file.read', target: '/tmp/test.txt' });
    expect(result.level).toBe('info');
  });

  it('should rate file delete as WARNING', () => {
    const assessor = new RiskAssessor();
    const result = assessor.assess({ operation: 'file.delete', target: '/tmp/test.txt' });
    expect(result.level).toBe('warning');
  });

  it('should rate unsigned skill install as DANGER', () => {
    const assessor = new RiskAssessor();
    const result = assessor.assess({ operation: 'skill.install', unsigned: true });
    expect(result.level).toBe('danger');
  });

  it('should rate system exec as WARNING', () => {
    const assessor = new RiskAssessor();
    const result = assessor.assess({ operation: 'system.exec', command: 'ls -la' });
    expect(result.level).toBe('warning');
  });

  it('should never return a blocked level', () => {
    const assessor = new RiskAssessor();
    const ops = [
      { operation: 'file.delete', target: '/' },
      { operation: 'skill.install', unsigned: true },
      { operation: 'system.exec', command: 'rm -rf /' },
    ];
    for (const op of ops) {
      const result = assessor.assess(op);
      expect(['info', 'notice', 'warning', 'danger']).toContain(result.level);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/security/riskAssessor.test.ts`
Expected: FAIL

**Step 3: Implement RiskAssessor**

```typescript
// packages/core/src/security/riskAssessor.ts
import type { RiskAssessment, RiskLevel, RiskMitigation } from '../types/security.js';

interface OperationContext {
  operation: string;
  target?: string;
  command?: string;
  unsigned?: boolean;
  [key: string]: unknown;
}

interface RiskRule {
  match: (ctx: OperationContext) => boolean;
  level: RiskLevel;
  description: (ctx: OperationContext) => string;
  mitigations?: RiskMitigation[];
}

const DEFAULT_RULES: RiskRule[] = [
  {
    match: (ctx) => ctx.operation === 'skill.install' && ctx.unsigned === true,
    level: 'danger',
    description: () => '安装未签名的第三方 Skill，可能包含恶意代码',
    mitigations: [{ label: '沙箱执行', description: '在沙箱中运行此 Skill', action: 'sandbox' }],
  },
  {
    match: (ctx) => ctx.operation === 'file.delete',
    level: 'warning',
    description: (ctx) => `删除文件: ${ctx.target ?? '未知路径'}`,
  },
  {
    match: (ctx) => ctx.operation === 'file.write' && !!ctx.target && !ctx.target.startsWith('/tmp'),
    level: 'notice',
    description: (ctx) => `写入文件: ${ctx.target}`,
  },
  {
    match: (ctx) => ctx.operation === 'system.exec',
    level: 'warning',
    description: (ctx) => `执行系统命令: ${ctx.command ?? '未知命令'}`,
    mitigations: [{ label: '沙箱执行', description: '在沙箱中执行此命令', action: 'sandbox' }],
  },
  {
    match: (ctx) => ctx.operation === 'network.outbound',
    level: 'notice',
    description: (ctx) => `访问外部网络: ${ctx.target ?? '未知地址'}`,
  },
];

export class RiskAssessor {
  private rules: RiskRule[];

  constructor(customRules?: RiskRule[]) {
    this.rules = customRules ?? DEFAULT_RULES;
  }

  assess(ctx: OperationContext): RiskAssessment {
    for (const rule of this.rules) {
      if (rule.match(ctx)) {
        return {
          level: rule.level,
          operation: ctx.operation,
          description: rule.description(ctx),
          mitigations: rule.mitigations,
        };
      }
    }
    return {
      level: 'info',
      operation: ctx.operation,
      description: `操作: ${ctx.operation}`,
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/security/riskAssessor.test.ts`
Expected: PASS

**Step 5: Write failing test for ApprovalEngine**

```typescript
// packages/core/src/security/approvalEngine.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ApprovalEngine } from './approvalEngine.js';
import type { RiskAssessment } from '../types/security.js';

describe('ApprovalEngine', () => {
  it('should auto-approve INFO level operations', async () => {
    const engine = new ApprovalEngine({ promptLevel: 'warning' });
    const assessment: RiskAssessment = {
      level: 'info',
      operation: 'file.read',
      description: 'Read a file',
    };
    const result = await engine.requestApproval(assessment);
    expect(result.approved).toBe(true);
    expect(result.autoApproved).toBe(true);
  });

  it('should auto-approve NOTICE when promptLevel is WARNING', async () => {
    const engine = new ApprovalEngine({ promptLevel: 'warning' });
    const assessment: RiskAssessment = {
      level: 'notice',
      operation: 'network.outbound',
      description: 'Access external network',
    };
    const result = await engine.requestApproval(assessment);
    expect(result.approved).toBe(true);
    expect(result.autoApproved).toBe(true);
  });

  it('should delegate to prompter for WARNING when promptLevel is WARNING', async () => {
    const prompter = vi.fn().mockResolvedValue({ chosenOption: 'proceed' });
    const engine = new ApprovalEngine({ promptLevel: 'warning', prompter });
    const assessment: RiskAssessment = {
      level: 'warning',
      operation: 'file.delete',
      description: 'Delete file',
    };
    const result = await engine.requestApproval(assessment);
    expect(prompter).toHaveBeenCalled();
    expect(result.approved).toBe(true);
  });

  it('should auto-approve everything when promptLevel is NONE', async () => {
    const engine = new ApprovalEngine({ promptLevel: 'none' });
    const assessment: RiskAssessment = {
      level: 'danger',
      operation: 'skill.install',
      description: 'Install unsigned skill',
    };
    const result = await engine.requestApproval(assessment);
    expect(result.approved).toBe(true);
    expect(result.autoApproved).toBe(true);
  });

  it('should respect trusted operations list', async () => {
    const engine = new ApprovalEngine({
      promptLevel: 'warning',
      trustedOperations: ['file.delete'],
    });
    const assessment: RiskAssessment = {
      level: 'warning',
      operation: 'file.delete',
      description: 'Delete file',
    };
    const result = await engine.requestApproval(assessment);
    expect(result.approved).toBe(true);
    expect(result.autoApproved).toBe(true);
  });

  it('should handle user cancellation', async () => {
    const prompter = vi.fn().mockResolvedValue({ chosenOption: 'cancel' });
    const engine = new ApprovalEngine({ promptLevel: 'warning', prompter });
    const assessment: RiskAssessment = {
      level: 'warning',
      operation: 'file.delete',
      description: 'Delete file',
    };
    const result = await engine.requestApproval(assessment);
    expect(result.approved).toBe(false);
  });
});
```

**Step 6: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/security/approvalEngine.test.ts`
Expected: FAIL

**Step 7: Implement ApprovalEngine**

```typescript
// packages/core/src/security/approvalEngine.ts
import type { RiskAssessment, RiskLevel } from '../types/security.js';

export interface ApprovalResult {
  approved: boolean;
  autoApproved: boolean;
  chosenOption?: string;
  mitigations?: string[];
}

export type PrompterFn = (assessment: RiskAssessment) => Promise<{ chosenOption: string }>;

interface ApprovalEngineConfig {
  promptLevel: 'none' | 'danger' | 'warning' | 'notice' | 'info';
  prompter?: PrompterFn;
  trustedOperations?: string[];
}

const LEVEL_PRIORITY: Record<RiskLevel, number> = {
  info: 0,
  notice: 1,
  warning: 2,
  danger: 3,
};

export class ApprovalEngine {
  private config: ApprovalEngineConfig;

  constructor(config: ApprovalEngineConfig) {
    this.config = config;
  }

  async requestApproval(assessment: RiskAssessment): Promise<ApprovalResult> {
    // Expert mode: approve everything
    if (this.config.promptLevel === 'none') {
      return { approved: true, autoApproved: true };
    }

    // Trusted operations: always approve
    if (this.config.trustedOperations?.includes(assessment.operation)) {
      return { approved: true, autoApproved: true };
    }

    // If risk level is below prompt threshold, auto-approve
    const riskPriority = LEVEL_PRIORITY[assessment.level];
    const thresholdPriority = LEVEL_PRIORITY[this.config.promptLevel as RiskLevel] ?? 0;
    if (riskPriority < thresholdPriority) {
      return { approved: true, autoApproved: true };
    }

    // Need user confirmation
    if (this.config.prompter) {
      const response = await this.config.prompter(assessment);
      if (response.chosenOption === 'cancel') {
        return { approved: false, autoApproved: false, chosenOption: 'cancel' };
      }
      return { approved: true, autoApproved: false, chosenOption: response.chosenOption };
    }

    // No prompter available, auto-approve with notice
    return { approved: true, autoApproved: true };
  }
}
```

**Step 8: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/security/approvalEngine.test.ts`
Expected: PASS

**Step 9: Implement AuditLog**

```typescript
// packages/core/src/security/auditLog.ts
import type { AuditEntry, RiskLevel } from '../types/security.js';
import { randomUUID } from 'node:crypto';

export class AuditLog {
  private entries: AuditEntry[] = [];

  record(params: {
    operation: string;
    riskLevel: RiskLevel;
    userId: string;
    sessionId: string;
    approved: boolean;
    details?: Record<string, unknown>;
  }): AuditEntry {
    const entry: AuditEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      ...params,
    };
    this.entries.push(entry);
    return entry;
  }

  query(filter?: {
    userId?: string;
    operation?: string;
    riskLevel?: RiskLevel;
    since?: number;
  }): AuditEntry[] {
    let result = this.entries;
    if (filter?.userId) result = result.filter((e) => e.userId === filter.userId);
    if (filter?.operation) result = result.filter((e) => e.operation === filter.operation);
    if (filter?.riskLevel) result = result.filter((e) => e.riskLevel === filter.riskLevel);
    if (filter?.since) result = result.filter((e) => e.timestamp >= filter.since);
    return result;
  }

  getAll(): AuditEntry[] {
    return [...this.entries];
  }
}
```

**Step 10: Create barrel export**

```typescript
// packages/core/src/security/index.ts
export { RiskAssessor } from './riskAssessor.js';
export { ApprovalEngine } from './approvalEngine.js';
export type { ApprovalResult, PrompterFn } from './approvalEngine.js';
export { AuditLog } from './auditLog.js';
```

**Step 11: Update core index**

Add to `packages/core/src/index.ts`:
```typescript
export * from './security/index.js';
```

**Step 12: Run all tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run`
Expected: All PASS

**Step 13: Commit**

```bash
git add packages/core/src/security/ packages/core/src/index.ts
git commit -m "feat(core): add risk assessor, approval engine (inform+confirm), and audit log"
```

---

### Task 6: Smart Router — Task Analyzer & Model Router

**Files:**
- Create: `packages/core/src/router/taskAnalyzer.ts`
- Create: `packages/core/src/router/modelRouter.ts`
- Create: `packages/core/src/router/contextManager.ts`
- Create: `packages/core/src/router/index.ts`
- Test: `packages/core/src/router/taskAnalyzer.test.ts`
- Test: `packages/core/src/router/modelRouter.test.ts`

**Step 1: Write failing test for TaskAnalyzer**

```typescript
// packages/core/src/router/taskAnalyzer.test.ts
import { describe, it, expect } from 'vitest';
import { TaskAnalyzer, TaskTier } from './taskAnalyzer.js';

describe('TaskAnalyzer', () => {
  const analyzer = new TaskAnalyzer();

  it('should classify greetings as TRIVIAL', () => {
    expect(analyzer.analyze('你好').tier).toBe(TaskTier.TRIVIAL);
    expect(analyzer.analyze('Hello').tier).toBe(TaskTier.TRIVIAL);
    expect(analyzer.analyze('hi').tier).toBe(TaskTier.TRIVIAL);
  });

  it('should classify simple questions as SIMPLE', () => {
    expect(analyzer.analyze('今天天气怎么样?').tier).toBe(TaskTier.SIMPLE);
    expect(analyzer.analyze('翻译一下 hello world').tier).toBe(TaskTier.SIMPLE);
  });

  it('should classify code requests as STANDARD', () => {
    const result = analyzer.analyze('帮我写一个排序算法');
    expect(result.tier).toBe(TaskTier.STANDARD);
  });

  it('should classify long complex requests as COMPLEX', () => {
    const longMsg = '请帮我设计一个完整的微服务架构，包含用户认证、订单管理、' +
      '支付系统、库存管理四个服务，需要考虑服务间通信、数据一致性、' +
      '故障恢复、监控告警等方面。每个服务需要详细的 API 设计和数据库 schema。';
    expect(analyzer.analyze(longMsg).tier).toBe(TaskTier.COMPLEX);
  });

  it('should return token budget for each tier', () => {
    const result = analyzer.analyze('hi');
    expect(result.maxInputTokens).toBeGreaterThan(0);
    expect(result.maxOutputTokens).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/router/taskAnalyzer.test.ts`
Expected: FAIL

**Step 3: Implement TaskAnalyzer**

```typescript
// packages/core/src/router/taskAnalyzer.ts
export enum TaskTier {
  TRIVIAL = 'trivial',
  SIMPLE = 'simple',
  STANDARD = 'standard',
  COMPLEX = 'complex',
}

export interface TaskAnalysis {
  tier: TaskTier;
  maxInputTokens: number;
  maxOutputTokens: number;
  contextWindowTurns: number;
  confidence: number;
}

const TIER_BUDGETS: Record<TaskTier, Omit<TaskAnalysis, 'tier' | 'confidence'>> = {
  [TaskTier.TRIVIAL]: { maxInputTokens: 500, maxOutputTokens: 200, contextWindowTurns: 2 },
  [TaskTier.SIMPLE]: { maxInputTokens: 2000, maxOutputTokens: 1000, contextWindowTurns: 5 },
  [TaskTier.STANDARD]: { maxInputTokens: 8000, maxOutputTokens: 4000, contextWindowTurns: 10 },
  [TaskTier.COMPLEX]: { maxInputTokens: 32000, maxOutputTokens: 16000, contextWindowTurns: 20 },
};

const GREETING_PATTERNS = /^(hi|hello|hey|你好|嗨|早上好|晚上好|下午好|早安|晚安)\b/i;
const CODE_KEYWORDS = /代码|code|算法|函数|function|class|接口|api|实现|implement|写[一个]|编写|debug|修复|bug/i;
const COMPLEX_INDICATORS = /架构|设计|系统|完整|详细|方案|分析|优化|重构|微服务|分布式/i;

export class TaskAnalyzer {
  analyze(text: string): TaskAnalysis {
    const tier = this.classifyTier(text);
    const budget = TIER_BUDGETS[tier];
    return { tier, ...budget, confidence: 0.8 };
  }

  private classifyTier(text: string): TaskTier {
    const len = text.length;

    if (len < 20 && GREETING_PATTERNS.test(text.trim())) {
      return TaskTier.TRIVIAL;
    }

    if (len > 100 && COMPLEX_INDICATORS.test(text)) {
      return TaskTier.COMPLEX;
    }

    if (CODE_KEYWORDS.test(text)) {
      return TaskTier.STANDARD;
    }

    if (len < 50) {
      return TaskTier.SIMPLE;
    }

    return TaskTier.SIMPLE;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/router/taskAnalyzer.test.ts`
Expected: PASS

**Step 5: Write failing test for ModelRouter**

```typescript
// packages/core/src/router/modelRouter.test.ts
import { describe, it, expect } from 'vitest';
import { ModelRouter } from './modelRouter.js';
import { TaskTier } from './taskAnalyzer.js';

describe('ModelRouter', () => {
  const router = new ModelRouter({
    tierModels: {
      [TaskTier.TRIVIAL]: 'claude-haiku',
      [TaskTier.SIMPLE]: 'claude-sonnet',
      [TaskTier.STANDARD]: 'claude-sonnet',
      [TaskTier.COMPLEX]: 'claude-opus',
    },
    defaultModel: 'claude-sonnet',
  });

  it('should route TRIVIAL tasks to small model', () => {
    expect(router.selectModel(TaskTier.TRIVIAL)).toBe('claude-haiku');
  });

  it('should route COMPLEX tasks to large model', () => {
    expect(router.selectModel(TaskTier.COMPLEX)).toBe('claude-opus');
  });

  it('should fall back to default model for unknown tier', () => {
    expect(router.selectModel('unknown' as TaskTier)).toBe('claude-sonnet');
  });
});
```

**Step 6: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/router/modelRouter.test.ts`
Expected: FAIL

**Step 7: Implement ModelRouter**

```typescript
// packages/core/src/router/modelRouter.ts
import type { TaskTier } from './taskAnalyzer.js';

interface ModelRouterConfig {
  tierModels: Record<string, string>;
  defaultModel: string;
}

export class ModelRouter {
  private config: ModelRouterConfig;

  constructor(config: ModelRouterConfig) {
    this.config = config;
  }

  selectModel(tier: TaskTier): string {
    return this.config.tierModels[tier] ?? this.config.defaultModel;
  }
}
```

**Step 8: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/core/src/router/modelRouter.test.ts`
Expected: PASS

**Step 9: Implement ContextManager stub**

```typescript
// packages/core/src/router/contextManager.ts
interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  importance?: number;
}

export class ContextManager {
  private turns: Map<string, ConversationTurn[]> = new Map();

  addTurn(sessionId: string, turn: ConversationTurn): void {
    if (!this.turns.has(sessionId)) {
      this.turns.set(sessionId, []);
    }
    this.turns.get(sessionId)!.push(turn);
  }

  getContext(sessionId: string, maxTurns: number): ConversationTurn[] {
    const turns = this.turns.get(sessionId) ?? [];
    if (turns.length <= maxTurns) return turns;
    return turns.slice(-maxTurns);
  }

  clearSession(sessionId: string): void {
    this.turns.delete(sessionId);
  }
}
```

**Step 10: Create barrel export**

```typescript
// packages/core/src/router/index.ts
export { TaskAnalyzer, TaskTier } from './taskAnalyzer.js';
export type { TaskAnalysis } from './taskAnalyzer.js';
export { ModelRouter } from './modelRouter.js';
export { ContextManager } from './contextManager.js';
```

**Step 11: Update core index**

Add to `packages/core/src/index.ts`:
```typescript
export * from './router/index.js';
```

**Step 12: Run all tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run`
Expected: All PASS

**Step 13: Commit**

```bash
git add packages/core/src/router/ packages/core/src/index.ts
git commit -m "feat(core): add task analyzer, model router, and context manager"
```

---

### Task 7: LLM Provider Abstraction

**Files:**
- Create: `packages/providers/src/base.ts`
- Create: `packages/providers/src/anthropic.ts`
- Create: `packages/providers/src/index.ts`
- Test: `packages/providers/src/base.test.ts`

**Step 1: Write failing test for provider base**

```typescript
// packages/providers/src/base.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ProviderRegistry } from './base.js';
import type { LLMProvider, ChatRequest, ChatResponse } from './base.js';

describe('ProviderRegistry', () => {
  const mockProvider: LLMProvider = {
    name: 'mock',
    models: ['mock-small', 'mock-large'],
    async chat(request: ChatRequest): Promise<ChatResponse> {
      return {
        content: `Echo: ${request.messages[request.messages.length - 1].content}`,
        model: request.model,
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
    async validateApiKey(): Promise<boolean> {
      return true;
    },
  };

  it('should register and retrieve a provider', () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider);
    expect(registry.get('mock')).toBe(mockProvider);
  });

  it('should resolve model to provider', () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider);
    expect(registry.resolveModel('mock-small')).toBe(mockProvider);
  });

  it('should return undefined for unknown model', () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider);
    expect(registry.resolveModel('unknown-model')).toBeUndefined();
  });

  it('should call provider chat', async () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider);
    const provider = registry.resolveModel('mock-small')!;
    const response = await provider.chat({
      model: 'mock-small',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(response.content).toBe('Echo: test');
    expect(response.usage.inputTokens).toBe(10);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/providers/src/base.test.ts`
Expected: FAIL

**Step 3: Implement provider base types and registry**

```typescript
// packages/providers/src/base.ts
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  tools?: ToolSchema[];
}

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: TokenUsage;
  toolCalls?: ToolCall[];
  stopReason?: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
}

export interface LLMProvider {
  name: string;
  models: string[];
  chat(request: ChatRequest): Promise<ChatResponse>;
  validateApiKey(): Promise<boolean>;
}

export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();
  private modelIndex = new Map<string, LLMProvider>();

  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
    for (const model of provider.models) {
      this.modelIndex.set(model, provider);
    }
  }

  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  resolveModel(model: string): LLMProvider | undefined {
    return this.modelIndex.get(model);
  }

  listAll(): LLMProvider[] {
    return [...this.providers.values()];
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/providers/src/base.test.ts`
Expected: PASS

**Step 5: Implement Anthropic provider stub**

```typescript
// packages/providers/src/anthropic.ts
import type { LLMProvider, ChatRequest, ChatResponse } from './base.js';

export interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
}

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  models = [
    'claude-opus-4-6',
    'claude-sonnet-4-5',
    'claude-haiku-3-5',
  ];

  private config: AnthropicConfig;

  constructor(config: AnthropicConfig) {
    this.config = config;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const baseUrl = this.config.baseUrl ?? 'https://api.anthropic.com';
    const messages = request.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages,
    };

    if (request.systemPrompt) {
      body.system = request.systemPrompt;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
      stop_reason?: string;
    };

    const textContent = data.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');

    return {
      content: textContent,
      model: data.model,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
      stopReason: data.stop_reason,
    };
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const baseUrl = this.config.baseUrl ?? 'https://api.anthropic.com';
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-3-5',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

**Step 6: Create barrel export**

```typescript
// packages/providers/src/index.ts
export { ProviderRegistry } from './base.js';
export type { LLMProvider, ChatRequest, ChatResponse, ChatMessage, TokenUsage, ToolCall, ToolSchema } from './base.js';
export { AnthropicProvider } from './anthropic.js';
export type { AnthropicConfig } from './anthropic.js';
```

**Step 7: Run all tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run`
Expected: All PASS

**Step 8: Commit**

```bash
git add packages/providers/src/
git commit -m "feat(providers): add LLM provider abstraction and Anthropic provider"
```

---

### Task 8: SDK — Channel & Skill Plugin Interfaces

**Files:**
- Create: `packages/sdk/src/channel.ts`
- Create: `packages/sdk/src/skill.ts`
- Create: `packages/sdk/src/types.ts`
- Create: `packages/sdk/src/index.ts`

**Step 1: Create SDK types**

```typescript
// packages/sdk/src/types.ts
export type { UnifiedMessage, OutgoingMessage, MessageContent, MessageSource } from '@xclaw/core';
export type { PluginManifest, ToolDefinition } from '@xclaw/core';
export type { RiskLevel, RiskAssessment } from '@xclaw/core';
```

**Step 2: Create channel plugin base class**

```typescript
// packages/sdk/src/channel.ts
import type { UnifiedMessage, OutgoingMessage, PluginManifest } from '@xclaw/core';

export type MessageHandler = (msg: UnifiedMessage) => Promise<void>;

export abstract class BaseChannelPlugin {
  abstract manifest: PluginManifest;

  protected messageHandler?: MessageHandler;

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  protected async dispatchMessage(msg: UnifiedMessage): Promise<void> {
    if (this.messageHandler) {
      await this.messageHandler(msg);
    }
  }

  abstract onLoad(): Promise<void>;
  abstract onUnload(): Promise<void>;
  abstract send(msg: OutgoingMessage): Promise<void>;
}
```

**Step 3: Create skill plugin base class**

```typescript
// packages/sdk/src/skill.ts
import type { PluginManifest, ToolDefinition } from '@xclaw/core';

export abstract class BaseSkillPlugin {
  abstract manifest: PluginManifest;
  abstract tools: ToolDefinition[];

  abstract execute(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}
```

**Step 4: Create barrel export**

```typescript
// packages/sdk/src/index.ts
export { BaseChannelPlugin } from './channel.js';
export type { MessageHandler } from './channel.js';
export { BaseSkillPlugin } from './skill.js';
export * from './types.js';
```

**Step 5: Commit**

```bash
git add packages/sdk/src/
git commit -m "feat(sdk): add base classes for channel and skill plugin development"
```

---

### Task 9: CLI Channel Plugin

**Files:**
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/start.ts`
- Create: `packages/cli/src/channel/cliChannel.ts`
- Test: `packages/cli/src/channel/cliChannel.test.ts`

**Step 1: Write failing test for CLI channel**

```typescript
// packages/cli/src/channel/cliChannel.test.ts
import { describe, it, expect, vi } from 'vitest';
import { CLIChannel } from './cliChannel.js';

describe('CLIChannel', () => {
  it('should have correct manifest', () => {
    const channel = new CLIChannel();
    expect(channel.manifest.name).toBe('cli');
    expect(channel.manifest.type).toBe('channel');
  });

  it('should format outgoing messages as text', () => {
    const channel = new CLIChannel();
    const formatted = channel.formatOutput({
      targetChannel: 'cli',
      targetUserId: 'local',
      targetSessionId: 'cli-sess',
      content: { type: 'text', text: 'Hello from xclaw!' },
    });
    expect(formatted).toBe('Hello from xclaw!');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/cli/src/channel/cliChannel.test.ts`
Expected: FAIL

**Step 3: Implement CLIChannel**

```typescript
// packages/cli/src/channel/cliChannel.ts
import { BaseChannelPlugin } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { randomUUID } from 'node:crypto';
import * as readline from 'node:readline';

export class CLIChannel extends BaseChannelPlugin {
  manifest: PluginManifest = {
    name: 'cli',
    version: '0.1.0',
    description: 'Terminal CLI channel for xclaw',
    type: 'channel',
  };

  private rl?: readline.Interface;
  private sessionId = `cli-${randomUUID().slice(0, 8)}`;

  async onLoad(): Promise<void> {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.rl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed === '/quit' || trimmed === '/exit') {
        await this.onUnload();
        process.exit(0);
      }

      const msg: UnifiedMessage = {
        id: randomUUID(),
        source: {
          channel: 'cli',
          userId: 'local',
          sessionId: this.sessionId,
        },
        content: { type: 'text', text: trimmed },
        timestamp: Date.now(),
      };
      await this.dispatchMessage(msg);
    });
  }

  async onUnload(): Promise<void> {
    this.rl?.close();
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const output = this.formatOutput(msg);
    console.log(output);
  }

  formatOutput(msg: OutgoingMessage): string {
    if (msg.content.type === 'text' && msg.content.text) {
      return msg.content.text;
    }
    return JSON.stringify(msg.content);
  }

  prompt(): void {
    process.stdout.write('\n> ');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run packages/cli/src/channel/cliChannel.test.ts`
Expected: PASS

**Step 5: Implement start command**

```typescript
// packages/cli/src/commands/start.ts
import {
  TaskAnalyzer,
  ModelRouter,
  ContextManager,
  TaskTier,
  RiskAssessor,
  ApprovalEngine,
  AuditLog,
  EventBus,
} from '@xclaw/core';
import { ProviderRegistry, AnthropicProvider } from '@xclaw/providers';
import type { UnifiedMessage } from '@xclaw/core';
import type { RiskAssessment } from '@xclaw/core';
import { CLIChannel } from '../channel/cliChannel.js';

export interface StartOptions {
  apiKey: string;
  model?: string;
  provider?: string;
}

export async function startCommand(options: StartOptions): Promise<void> {
  console.log('🦞 xclaw starting...\n');

  // Initialize core components
  const eventBus = new EventBus();
  const taskAnalyzer = new TaskAnalyzer();
  const modelRouter = new ModelRouter({
    tierModels: {
      [TaskTier.TRIVIAL]: 'claude-haiku-3-5',
      [TaskTier.SIMPLE]: 'claude-sonnet-4-5',
      [TaskTier.STANDARD]: 'claude-sonnet-4-5',
      [TaskTier.COMPLEX]: 'claude-opus-4-6',
    },
    defaultModel: options.model ?? 'claude-sonnet-4-5',
  });
  const contextManager = new ContextManager();
  const riskAssessor = new RiskAssessor();
  const auditLog = new AuditLog();

  const approvalEngine = new ApprovalEngine({
    promptLevel: 'warning',
    prompter: async (assessment: RiskAssessment) => {
      console.log(`\n⚠️  ${assessment.description}`);
      console.log('  按 Enter 继续，输入 cancel 取消');
      return new Promise((resolve) => {
        process.stdin.once('data', (data) => {
          const input = data.toString().trim().toLowerCase();
          resolve({ chosenOption: input === 'cancel' ? 'cancel' : 'proceed' });
        });
      });
    },
  });

  // Initialize provider
  const providerRegistry = new ProviderRegistry();
  const anthropic = new AnthropicProvider({ apiKey: options.apiKey });
  providerRegistry.register(anthropic);

  // Initialize CLI channel
  const cliChannel = new CLIChannel();

  cliChannel.onMessage(async (msg: UnifiedMessage) => {
    if (msg.content.type !== 'text' || !msg.content.text) return;

    const text = msg.content.text;

    // Analyze task complexity
    const analysis = taskAnalyzer.analyze(text);
    const selectedModel = modelRouter.selectModel(analysis.tier);

    // Add to context
    contextManager.addTurn(msg.source.sessionId, {
      role: 'user',
      content: text,
      timestamp: msg.timestamp,
    });

    // Get conversation context
    const history = contextManager.getContext(msg.source.sessionId, analysis.contextWindowTurns);
    const messages = history.map((t) => ({ role: t.role, content: t.content }));

    // Resolve provider
    const provider = providerRegistry.resolveModel(selectedModel);
    if (!provider) {
      await cliChannel.send({
        targetChannel: 'cli',
        targetUserId: 'local',
        targetSessionId: msg.source.sessionId,
        content: { type: 'text', text: `错误: 无法找到模型 ${selectedModel} 的提供商` },
      });
      cliChannel.prompt();
      return;
    }

    try {
      const response = await provider.chat({
        model: selectedModel,
        messages,
        maxTokens: analysis.maxOutputTokens,
      });

      // Record in context
      contextManager.addTurn(msg.source.sessionId, {
        role: 'assistant',
        content: response.content,
        timestamp: Date.now(),
      });

      // Audit log
      auditLog.record({
        operation: 'llm.chat',
        riskLevel: 'info',
        userId: msg.source.userId,
        sessionId: msg.source.sessionId,
        approved: true,
        details: {
          model: selectedModel,
          tier: analysis.tier,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
      });

      await cliChannel.send({
        targetChannel: 'cli',
        targetUserId: 'local',
        targetSessionId: msg.source.sessionId,
        content: { type: 'text', text: response.content },
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await cliChannel.send({
        targetChannel: 'cli',
        targetUserId: 'local',
        targetSessionId: msg.source.sessionId,
        content: {
          type: 'text',
          text: `❌ 请求失败: ${errMsg}\n  建议: 检查 API Key 是否有效 (xclaw doctor)`,
        },
      });
    }

    cliChannel.prompt();
  });

  await cliChannel.onLoad();
  console.log('✅ xclaw 已就绪! 输入消息开始对话，/quit 退出\n');
  cliChannel.prompt();
}
```

**Step 6: Create CLI entry point**

```typescript
// packages/cli/src/index.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { startCommand } from './commands/start.js';

const program = new Command();

program
  .name('xclaw')
  .description('🦞 xclaw — Your AI assistant gateway')
  .version('0.1.0');

program
  .command('start')
  .description('Start the xclaw gateway')
  .option('-k, --api-key <key>', 'LLM provider API key (or set XCLAW_ANTHROPIC_KEY)')
  .option('-m, --model <model>', 'Default model to use', 'claude-sonnet-4-5')
  .action(async (opts) => {
    const apiKey = opts.apiKey || process.env.XCLAW_ANTHROPIC_KEY;
    if (!apiKey) {
      console.error('❌ 需要 API Key。使用 --api-key 参数或设置 XCLAW_ANTHROPIC_KEY 环境变量');
      process.exit(1);
    }
    await startCommand({ apiKey, model: opts.model });
  });

program.parse();
```

**Step 7: Run all tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run`
Expected: All PASS

**Step 8: Commit**

```bash
git add packages/cli/src/
git commit -m "feat(cli): add CLI channel and start command with full vertical slice"
```

---

### Task 10: Integration Smoke Test

**Files:**
- Create: `test/integration/vertical-slice.test.ts`

**Step 1: Write integration test**

```typescript
// test/integration/vertical-slice.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  TaskAnalyzer,
  TaskTier,
  ModelRouter,
  ContextManager,
  RiskAssessor,
  ApprovalEngine,
  AuditLog,
  EventBus,
  PluginRegistry as CorePluginRegistry,
} from '@xclaw/core';
import { ProviderRegistry } from '@xclaw/providers';
import type { LLMProvider, ChatRequest, ChatResponse } from '@xclaw/providers';

describe('Vertical Slice Integration', () => {
  // Mock LLM provider for testing
  const mockProvider: LLMProvider = {
    name: 'mock',
    models: ['mock-haiku', 'mock-sonnet', 'mock-opus'],
    async chat(request: ChatRequest): Promise<ChatResponse> {
      return {
        content: `Response to: ${request.messages[request.messages.length - 1].content}`,
        model: request.model,
        usage: { inputTokens: 50, outputTokens: 30 },
      };
    },
    async validateApiKey() { return true; },
  };

  it('should route a simple greeting through the full stack', async () => {
    // 1. Task analysis
    const analyzer = new TaskAnalyzer();
    const analysis = analyzer.analyze('你好');
    expect(analysis.tier).toBe(TaskTier.TRIVIAL);

    // 2. Model routing
    const modelRouter = new ModelRouter({
      tierModels: {
        [TaskTier.TRIVIAL]: 'mock-haiku',
        [TaskTier.SIMPLE]: 'mock-sonnet',
        [TaskTier.STANDARD]: 'mock-sonnet',
        [TaskTier.COMPLEX]: 'mock-opus',
      },
      defaultModel: 'mock-sonnet',
    });
    const model = modelRouter.selectModel(analysis.tier);
    expect(model).toBe('mock-haiku');

    // 3. Security check
    const riskAssessor = new RiskAssessor();
    const assessment = riskAssessor.assess({ operation: 'llm.chat' });
    expect(assessment.level).toBe('info');

    const approvalEngine = new ApprovalEngine({ promptLevel: 'warning' });
    const approval = await approvalEngine.requestApproval(assessment);
    expect(approval.approved).toBe(true);

    // 4. Context management
    const contextMgr = new ContextManager();
    contextMgr.addTurn('test-sess', {
      role: 'user',
      content: '你好',
      timestamp: Date.now(),
    });
    const context = contextMgr.getContext('test-sess', analysis.contextWindowTurns);
    expect(context).toHaveLength(1);

    // 5. Provider resolution and chat
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(mockProvider);
    const provider = providerRegistry.resolveModel(model)!;
    expect(provider).toBeDefined();

    const response = await provider.chat({
      model,
      messages: context.map((t) => ({ role: t.role, content: t.content })),
      maxTokens: analysis.maxOutputTokens,
    });
    expect(response.content).toContain('你好');

    // 6. Audit
    const auditLog = new AuditLog();
    const entry = auditLog.record({
      operation: 'llm.chat',
      riskLevel: 'info',
      userId: 'test-user',
      sessionId: 'test-sess',
      approved: true,
      details: { model, tier: analysis.tier },
    });
    expect(entry.operation).toBe('llm.chat');
  });

  it('should select bigger model for complex tasks', async () => {
    const analyzer = new TaskAnalyzer();
    const analysis = analyzer.analyze(
      '请帮我设计一个完整的微服务架构，包含用户认证、订单管理、支付系统、库存管理四个服务，' +
      '需要考虑服务间通信、数据一致性、故障恢复、监控告警等方面。'
    );
    expect(analysis.tier).toBe(TaskTier.COMPLEX);

    const modelRouter = new ModelRouter({
      tierModels: {
        [TaskTier.TRIVIAL]: 'mock-haiku',
        [TaskTier.SIMPLE]: 'mock-sonnet',
        [TaskTier.STANDARD]: 'mock-sonnet',
        [TaskTier.COMPLEX]: 'mock-opus',
      },
      defaultModel: 'mock-sonnet',
    });
    expect(modelRouter.selectModel(analysis.tier)).toBe('mock-opus');
    expect(analysis.maxInputTokens).toBeGreaterThanOrEqual(32000);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run test/integration/vertical-slice.test.ts`
Expected: PASS

**Step 3: Run full test suite**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add test/
git commit -m "test: add vertical slice integration test covering full message flow"
```

---

### Task 11: Build Verification & Cleanup

**Step 1: Run build**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm build`
Expected: All packages build successfully

**Step 2: Fix any build errors**

Fix TypeScript compilation issues if any arise.

**Step 3: Run full test suite one final time**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm vitest run`
Expected: All PASS

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify build and finalize Phase 1 scaffold"
```

---

## Phase 2 Preview (Future Tasks)

Phase 1 delivers the working vertical slice. Future phases will add:

- **Phase 2**: Sandbox engine (bubblewrap + macOS sandbox-exec + isolated-vm fallback)
- **Phase 3**: Secrets management (keytar integration, encrypted config)
- **Phase 4**: Compatibility adapters (OpenClaw shim, MCP bridge, Claude Code adapter)
- **Phase 5**: Additional LLM providers (OpenAI, Google, Ollama)
- **Phase 6**: Additional channels (Telegram, Slack, Discord, Feishu)
- **Phase 7**: `xclaw init` guided setup wizard, `xclaw doctor`, `xclaw config`
- **Phase 8**: Context manager enhancements (summarization, semantic cache, token budget)
- **Phase 9**: Web dashboard UI
- **Phase 10**: Docker/cloud deployment configurations
