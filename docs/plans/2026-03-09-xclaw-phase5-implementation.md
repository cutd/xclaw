# Phase 5: Multi-Channel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the SDK with reconnect/chunking/activation-mode support, then implement 8 messaging channel plugins (Telegram, Discord, Slack, Feishu, WeCom, Google Chat, Teams, Mattermost) plus CLI channel management commands.

**Architecture:** `@xclaw/sdk`'s `BaseChannelPlugin` is extended with `reconnect()`, `chunkMessage()`, and activation-mode filtering. Each channel is a separate pnpm workspace package under `channels/<name>/` that extends `BaseChannelPlugin`, using the platform's official SDK. CLI commands enable/disable channels and dynamically load them at startup.

**Tech Stack:** TypeScript 5.x ESM, Node.js >= 22, pnpm monorepo, `telegraf` (Telegram), `discord.js` (Discord), `@slack/bolt` (Slack), `@larksuiteoapi/node-sdk` (Feishu), HTTP API (WeCom), `googleapis` (Google Chat), `botbuilder` (Teams), `@mattermost/client` (Mattermost), Vitest

---

## Phase 5 Overview

```
Task 1:  SDK enhancements — reconnect, chunking, activation modes, BaseChannelConfig
Task 2:  Telegram channel — @xclaw/channel-telegram using telegraf
Task 3:  Discord channel — @xclaw/channel-discord using discord.js
Task 4:  Slack channel — @xclaw/channel-slack using @slack/bolt
Task 5:  Feishu channel — @xclaw/channel-feishu using @larksuiteoapi/node-sdk
Task 6:  WeCom channel — @xclaw/channel-wecom using HTTP API
Task 7:  Google Chat channel — @xclaw/channel-gchat using googleapis
Task 8:  Teams channel — @xclaw/channel-teams using botbuilder
Task 9:  Mattermost channel — @xclaw/channel-mattermost using @mattermost/client
Task 10: CLI channel commands — list, enable, disable + dynamic loading
Task 11: Integration tests — dynamic channel loading from config
```

---

### Task 1: SDK Enhancements

**Files:**
- Modify: `packages/sdk/src/channel.ts`
- Create: `packages/sdk/src/channel.test.ts`
- Modify: `packages/sdk/src/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/sdk/src/channel.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BaseChannelPlugin, type MessageHandler } from './channel.js';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';

// Concrete test implementation
class TestChannel extends BaseChannelPlugin {
  manifest: PluginManifest = { name: 'test', version: '0.1.0', description: 'Test', type: 'channel' };
  connected = false;

  async onLoad(): Promise<void> { this.connected = true; }
  async onUnload(): Promise<void> { this.connected = false; }
  async send(msg: OutgoingMessage): Promise<void> {}
}

describe('BaseChannelPlugin', () => {
  describe('chunkMessage', () => {
    it('should return single chunk for short messages', () => {
      const channel = new TestChannel();
      const chunks = channel.chunkMessage('Hello world', 100);
      expect(chunks).toEqual(['Hello world']);
    });

    it('should split at paragraph boundaries', () => {
      const channel = new TestChannel();
      const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
      const chunks = channel.chunkMessage(text, 30);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0]).toContain('Paragraph one.');
    });

    it('should hard-cut when no natural break point', () => {
      const channel = new TestChannel();
      const text = 'A'.repeat(100);
      const chunks = channel.chunkMessage(text, 40);
      expect(chunks.length).toBe(3);
      expect(chunks[0]).toHaveLength(40);
    });
  });

  describe('reconnect', () => {
    it('should return delay based on exponential backoff', () => {
      const channel = new TestChannel();
      const delay0 = channel.getReconnectDelay(0);
      const delay1 = channel.getReconnectDelay(1);
      const delay5 = channel.getReconnectDelay(5);
      expect(delay0).toBe(1000);
      expect(delay1).toBe(2000);
      expect(delay5).toBeLessThanOrEqual(60000);
    });

    it('should cap at max delay', () => {
      const channel = new TestChannel();
      const delay = channel.getReconnectDelay(100);
      expect(delay).toBeLessThanOrEqual(60000);
    });
  });

  describe('activation modes', () => {
    it('should dispatch all messages in always mode', async () => {
      const channel = new TestChannel();
      const handler = vi.fn();
      channel.onMessage(handler);
      channel.setActivationMode('always');

      const msg: UnifiedMessage = {
        id: '1', source: { channel: 'test', userId: 'u1', sessionId: 's1' },
        content: { type: 'text', text: 'hello' }, timestamp: Date.now(),
      };
      await channel.handleIncoming(msg, { isMention: false, isReply: false });
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should filter non-mention messages in mention mode', async () => {
      const channel = new TestChannel();
      const handler = vi.fn();
      channel.onMessage(handler);
      channel.setActivationMode('mention');

      const msg: UnifiedMessage = {
        id: '1', source: { channel: 'test', userId: 'u1', sessionId: 's1' },
        content: { type: 'text', text: 'hello' }, timestamp: Date.now(),
      };
      await channel.handleIncoming(msg, { isMention: false, isReply: false });
      expect(handler).not.toHaveBeenCalled();

      await channel.handleIncoming(msg, { isMention: true, isReply: false });
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should filter non-reply messages in reply mode', async () => {
      const channel = new TestChannel();
      const handler = vi.fn();
      channel.onMessage(handler);
      channel.setActivationMode('reply');

      const msg: UnifiedMessage = {
        id: '1', source: { channel: 'test', userId: 'u1', sessionId: 's1' },
        content: { type: 'text', text: 'hello' }, timestamp: Date.now(),
      };
      await channel.handleIncoming(msg, { isMention: false, isReply: false });
      expect(handler).not.toHaveBeenCalled();

      await channel.handleIncoming(msg, { isMention: false, isReply: true });
      expect(handler).toHaveBeenCalledOnce();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/sdk/src/channel.test.ts`
Expected: FAIL

**Step 3: Implement SDK enhancements**

```typescript
// packages/sdk/src/channel.ts
import type { UnifiedMessage, OutgoingMessage, PluginManifest } from '@xclaw/core';

export type MessageHandler = (msg: UnifiedMessage) => Promise<void>;
export type ActivationMode = 'always' | 'mention' | 'reply';

export interface MessageContext {
  isMention: boolean;
  isReply: boolean;
}

export abstract class BaseChannelPlugin {
  abstract manifest: PluginManifest;

  protected messageHandler?: MessageHandler;
  private activationMode: ActivationMode = 'always';

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  setActivationMode(mode: ActivationMode): void {
    this.activationMode = mode;
  }

  /**
   * Called by channel implementations with incoming messages.
   * Filters based on activation mode before dispatching.
   */
  async handleIncoming(msg: UnifiedMessage, context: MessageContext): Promise<void> {
    if (this.activationMode === 'mention' && !context.isMention) return;
    if (this.activationMode === 'reply' && !context.isReply) return;
    await this.dispatchMessage(msg);
  }

  protected async dispatchMessage(msg: UnifiedMessage): Promise<void> {
    if (this.messageHandler) {
      await this.messageHandler(msg);
    }
  }

  /**
   * Split a long message into chunks respecting maxLength.
   * Tries paragraph boundaries first, then sentence, then hard cut.
   */
  chunkMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try paragraph break
      let cutIdx = remaining.lastIndexOf('\n\n', maxLength);
      if (cutIdx > 0) {
        chunks.push(remaining.slice(0, cutIdx).trimEnd());
        remaining = remaining.slice(cutIdx + 2).trimStart();
        continue;
      }

      // Try sentence break
      cutIdx = remaining.lastIndexOf('. ', maxLength);
      if (cutIdx > 0) {
        chunks.push(remaining.slice(0, cutIdx + 1));
        remaining = remaining.slice(cutIdx + 2).trimStart();
        continue;
      }

      // Hard cut
      chunks.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength);
    }

    return chunks;
  }

  /**
   * Get reconnect delay using exponential backoff.
   * Base: 1000ms, factor: 2, max: 60000ms.
   */
  getReconnectDelay(attempt: number): number {
    const base = 1000;
    const factor = 2;
    const max = 60000;
    return Math.min(base * Math.pow(factor, attempt), max);
  }

  abstract onLoad(): Promise<void>;
  abstract onUnload(): Promise<void>;
  abstract send(msg: OutgoingMessage): Promise<void>;
}
```

**Step 4: Update SDK index**

Add to `packages/sdk/src/index.ts`:
```typescript
export type { ActivationMode, MessageContext } from './channel.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/sdk/src/channel.test.ts`
Expected: PASS

**Step 6: Run ALL tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add packages/sdk/
git commit -m "feat(sdk): enhance BaseChannelPlugin — reconnect, chunking, activation modes"
```

---

### Task 2: Telegram Channel

**Files:**
- Create: `channels/telegram/package.json`
- Create: `channels/telegram/tsconfig.json`
- Create: `channels/telegram/src/index.ts`
- Create: `channels/telegram/src/telegramChannel.ts`
- Create: `channels/telegram/src/telegramChannel.test.ts`

**Step 1: Create package scaffolding**

```json
// channels/telegram/package.json
{
  "name": "@xclaw/channel-telegram",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@xclaw/core": "workspace:*",
    "@xclaw/sdk": "workspace:*",
    "telegraf": "^4.16.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

```json
// channels/telegram/tsconfig.json
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

**Step 2: Write the failing test**

```typescript
// channels/telegram/src/telegramChannel.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TelegramChannel } from './telegramChannel.js';

// Mock telegraf
vi.mock('telegraf', () => {
  const handlers: Record<string, Function> = {};
  return {
    Telegraf: vi.fn().mockImplementation(() => ({
      on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }),
      launch: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      telegram: {
        sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }),
      },
      botInfo: { id: 123, is_bot: true, first_name: 'xclaw', username: 'xclaw_bot' },
      _handlers: handlers,
    })),
  };
});

describe('TelegramChannel', () => {
  it('should have correct manifest', () => {
    const channel = new TelegramChannel({ token: 'fake-token' });
    expect(channel.manifest.name).toBe('telegram');
    expect(channel.manifest.type).toBe('channel');
  });

  it('should normalize a Telegram text message to UnifiedMessage', () => {
    const channel = new TelegramChannel({ token: 'fake-token' });
    const raw = {
      message: {
        message_id: 42,
        from: { id: 111, first_name: 'User' },
        chat: { id: 222, type: 'private' },
        text: 'Hello bot',
        date: 1700000000,
      },
    };
    const msg = channel.normalizeMessage(raw);
    expect(msg.content.text).toBe('Hello bot');
    expect(msg.source.channel).toBe('telegram');
    expect(msg.source.userId).toBe('111');
    expect(msg.source.sessionId).toBe('222');
  });

  it('should chunk long messages using Telegram limit (4096)', () => {
    const channel = new TelegramChannel({ token: 'fake-token' });
    const long = 'A'.repeat(5000);
    const chunks = channel.chunkMessage(long, 4096);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toHaveLength(4096);
  });

  it('should detect mentions in group messages', () => {
    const channel = new TelegramChannel({ token: 'fake-token' });
    const isMention = channel.detectMention('@xclaw_bot hello', 'xclaw_bot');
    expect(isMention).toBe(true);

    const notMention = channel.detectMention('hello', 'xclaw_bot');
    expect(notMention).toBe(false);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm install && pnpm test -- --run channels/telegram/src/telegramChannel.test.ts`
Expected: FAIL

**Step 4: Implement TelegramChannel**

```typescript
// channels/telegram/src/telegramChannel.ts
import { BaseChannelPlugin } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { Telegraf } from 'telegraf';
import { randomUUID } from 'node:crypto';

export interface TelegramConfig {
  token: string;
  activationMode?: 'always' | 'mention' | 'reply';
}

export class TelegramChannel extends BaseChannelPlugin {
  manifest: PluginManifest = {
    name: 'telegram',
    version: '0.1.0',
    description: 'Telegram channel for xclaw',
    type: 'channel',
  };

  private bot: Telegraf;
  private readonly config: TelegramConfig;
  private botUsername = '';

  constructor(config: TelegramConfig) {
    super();
    this.config = config;
    this.bot = new Telegraf(config.token);
    if (config.activationMode) {
      this.setActivationMode(config.activationMode);
    }
  }

  async onLoad(): Promise<void> {
    this.bot.on('text', async (ctx) => {
      const msg = this.normalizeMessage(ctx);
      const isMention = this.detectMention(
        ctx.message.text ?? '',
        this.botUsername,
      );
      const isReply = ctx.message.reply_to_message?.from?.id === this.bot.botInfo?.id;
      await this.handleIncoming(msg, { isMention, isReply });
    });

    await this.bot.launch();
    this.botUsername = this.bot.botInfo?.username ?? '';
  }

  async onUnload(): Promise<void> {
    this.bot.stop();
  }

  async send(msg: OutgoingMessage): Promise<void> {
    const chatId = msg.targetSessionId;
    const text = msg.content.text ?? '';
    const chunks = this.chunkMessage(text, 4096);
    for (const chunk of chunks) {
      await this.bot.telegram.sendMessage(chatId, chunk);
    }
  }

  normalizeMessage(ctx: Record<string, unknown>): UnifiedMessage {
    const message = (ctx.message ?? ctx) as Record<string, unknown>;
    const from = message.from as Record<string, unknown> | undefined;
    const chat = message.chat as Record<string, unknown> | undefined;

    return {
      id: randomUUID(),
      source: {
        channel: 'telegram',
        userId: String(from?.id ?? 'unknown'),
        sessionId: String(chat?.id ?? 'unknown'),
      },
      content: {
        type: 'text',
        text: (message.text as string) ?? '',
      },
      timestamp: ((message.date as number) ?? Math.floor(Date.now() / 1000)) * 1000,
    };
  }

  detectMention(text: string, botUsername: string): boolean {
    if (!botUsername) return false;
    return text.includes(`@${botUsername}`);
  }
}
```

```typescript
// channels/telegram/src/index.ts
export { TelegramChannel } from './telegramChannel.js';
export type { TelegramConfig } from './telegramChannel.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run channels/telegram/src/telegramChannel.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add channels/telegram/
git commit -m "feat(channels): implement Telegram channel — telegraf, mention detection, chunking"
```

---

### Tasks 3-9: Remaining Channels

Each channel follows the exact same pattern as Task 2. Below is the implementation for each.

---

### Task 3: Discord Channel

**Files:**
- Create: `channels/discord/package.json` (dep: `discord.js@^14.0.0`)
- Create: `channels/discord/tsconfig.json`
- Create: `channels/discord/src/index.ts`
- Create: `channels/discord/src/discordChannel.ts`
- Create: `channels/discord/src/discordChannel.test.ts`

**Step 1: Write test + implementation**

```typescript
// channels/discord/src/discordChannel.test.ts
import { describe, it, expect, vi } from 'vitest';
import { DiscordChannel } from './discordChannel.js';

vi.mock('discord.js', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      login: vi.fn().mockResolvedValue('token'),
      destroy: vi.fn(),
      user: { id: 'bot-123', username: 'xclaw' },
    })),
    GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 4, DirectMessages: 8 },
    Partials: { Channel: 0 },
  };
});

describe('DiscordChannel', () => {
  it('should have correct manifest', () => {
    const channel = new DiscordChannel({ token: 'fake' });
    expect(channel.manifest.name).toBe('discord');
    expect(channel.manifest.type).toBe('channel');
  });

  it('should normalize a Discord message', () => {
    const channel = new DiscordChannel({ token: 'fake' });
    const msg = channel.normalizeMessage({
      id: 'msg-1',
      author: { id: 'user-1' },
      channelId: 'ch-1',
      content: 'Hello from Discord',
      createdTimestamp: 1700000000000,
    });
    expect(msg.content.text).toBe('Hello from Discord');
    expect(msg.source.channel).toBe('discord');
    expect(msg.source.userId).toBe('user-1');
  });

  it('should detect mentions', () => {
    const channel = new DiscordChannel({ token: 'fake' });
    expect(channel.detectMention('<@bot-123> hello', 'bot-123')).toBe(true);
    expect(channel.detectMention('hello', 'bot-123')).toBe(false);
  });

  it('should chunk at Discord limit (2000)', () => {
    const channel = new DiscordChannel({ token: 'fake' });
    const chunks = channel.chunkMessage('A'.repeat(3000), 2000);
    expect(chunks.length).toBe(2);
  });
});
```

```typescript
// channels/discord/src/discordChannel.ts
import { BaseChannelPlugin } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { randomUUID } from 'node:crypto';

export interface DiscordConfig {
  token: string;
  activationMode?: 'always' | 'mention' | 'reply';
}

export class DiscordChannel extends BaseChannelPlugin {
  manifest: PluginManifest = {
    name: 'discord', version: '0.1.0', description: 'Discord channel for xclaw', type: 'channel',
  };

  private client: Client;
  private readonly config: DiscordConfig;

  constructor(config: DiscordConfig) {
    super();
    this.config = config;
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
      partials: [Partials.Channel],
    });
    if (config.activationMode) this.setActivationMode(config.activationMode);
  }

  async onLoad(): Promise<void> {
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      const msg = this.normalizeMessage(message);
      const botId = this.client.user?.id ?? '';
      const isMention = this.detectMention(message.content, botId);
      const isReply = message.reference?.messageId !== undefined;
      await this.handleIncoming(msg, { isMention, isReply });
    });
    await this.client.login(this.config.token);
  }

  async onUnload(): Promise<void> { this.client.destroy(); }

  async send(msg: OutgoingMessage): Promise<void> {
    const channel = await this.client.channels.fetch(msg.targetSessionId);
    if (!channel?.isTextBased()) return;
    const chunks = this.chunkMessage(msg.content.text ?? '', 2000);
    for (const chunk of chunks) {
      await (channel as any).send(chunk);
    }
  }

  normalizeMessage(raw: Record<string, unknown>): UnifiedMessage {
    const author = raw.author as Record<string, unknown> | undefined;
    return {
      id: randomUUID(),
      source: { channel: 'discord', userId: String(author?.id ?? 'unknown'), sessionId: String(raw.channelId ?? 'unknown') },
      content: { type: 'text', text: String(raw.content ?? '') },
      timestamp: (raw.createdTimestamp as number) ?? Date.now(),
    };
  }

  detectMention(text: string, botId: string): boolean {
    return text.includes(`<@${botId}>`);
  }
}
```

```typescript
// channels/discord/src/index.ts
export { DiscordChannel } from './discordChannel.js';
export type { DiscordConfig } from './discordChannel.js';
```

**Step 2: Run test, verify pass, commit**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm install && pnpm test -- --run channels/discord/src/discordChannel.test.ts`

```bash
git add channels/discord/
git commit -m "feat(channels): implement Discord channel — discord.js, mention detection, chunking"
```

---

### Task 4: Slack Channel

**Files:** `channels/slack/` (dep: `@slack/bolt@^3.0.0`)

```typescript
// channels/slack/src/slackChannel.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SlackChannel } from './slackChannel.js';

vi.mock('@slack/bolt', () => ({
  App: vi.fn().mockImplementation(() => ({
    message: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    client: { chat: { postMessage: vi.fn().mockResolvedValue({ ok: true }) } },
  })),
}));

describe('SlackChannel', () => {
  it('should have correct manifest', () => {
    const ch = new SlackChannel({ token: 'xoxb-fake', appToken: 'xapp-fake', signingSecret: 'secret' });
    expect(ch.manifest.name).toBe('slack');
  });

  it('should normalize a Slack message', () => {
    const ch = new SlackChannel({ token: 'x', appToken: 'x', signingSecret: 'x' });
    const msg = ch.normalizeMessage({ text: 'Hello', user: 'U123', channel: 'C456', ts: '1700000000.000000' });
    expect(msg.content.text).toBe('Hello');
    expect(msg.source.userId).toBe('U123');
    expect(msg.source.sessionId).toBe('C456');
  });

  it('should detect bot mention', () => {
    const ch = new SlackChannel({ token: 'x', appToken: 'x', signingSecret: 'x' });
    expect(ch.detectMention('<@U_BOT> hello', 'U_BOT')).toBe(true);
    expect(ch.detectMention('hello', 'U_BOT')).toBe(false);
  });
});
```

```typescript
// channels/slack/src/slackChannel.ts
import { BaseChannelPlugin } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { App } from '@slack/bolt';
import { randomUUID } from 'node:crypto';

export interface SlackConfig {
  token: string;
  appToken: string;
  signingSecret: string;
  activationMode?: 'always' | 'mention' | 'reply';
}

export class SlackChannel extends BaseChannelPlugin {
  manifest: PluginManifest = { name: 'slack', version: '0.1.0', description: 'Slack channel for xclaw', type: 'channel' };
  private app: App;
  private readonly config: SlackConfig;

  constructor(config: SlackConfig) {
    super();
    this.config = config;
    this.app = new App({ token: config.token, appToken: config.appToken, signingSecret: config.signingSecret, socketMode: true });
    if (config.activationMode) this.setActivationMode(config.activationMode);
  }

  async onLoad(): Promise<void> {
    this.app.message(async ({ message }) => {
      const m = message as Record<string, unknown>;
      if (m.subtype) return;
      const msg = this.normalizeMessage(m);
      const isMention = this.detectMention(String(m.text ?? ''), '');
      const isReply = !!(m.thread_ts && m.thread_ts !== m.ts);
      await this.handleIncoming(msg, { isMention, isReply });
    });
    await this.app.start();
  }

  async onUnload(): Promise<void> { await this.app.stop(); }

  async send(msg: OutgoingMessage): Promise<void> {
    const chunks = this.chunkMessage(msg.content.text ?? '', 40000);
    for (const chunk of chunks) {
      await this.app.client.chat.postMessage({ channel: msg.targetSessionId, text: chunk });
    }
  }

  normalizeMessage(raw: Record<string, unknown>): UnifiedMessage {
    return {
      id: randomUUID(),
      source: { channel: 'slack', userId: String(raw.user ?? 'unknown'), sessionId: String(raw.channel ?? 'unknown') },
      content: { type: 'text', text: String(raw.text ?? '') },
      timestamp: Math.floor(parseFloat(String(raw.ts ?? '0')) * 1000),
    };
  }

  detectMention(text: string, botId: string): boolean {
    return /<@[A-Z0-9]+>/.test(text);
  }
}
```

Commit: `feat(channels): implement Slack channel — @slack/bolt, socket mode, chunking`

---

### Task 5: Feishu Channel

**Files:** `channels/feishu/` (dep: `@larksuiteoapi/node-sdk@^1.0.0`)

```typescript
// channels/feishu/src/feishuChannel.test.ts
import { describe, it, expect, vi } from 'vitest';
import { FeishuChannel } from './feishuChannel.js';

vi.mock('@larksuiteoapi/node-sdk', () => ({
  Client: vi.fn().mockImplementation(() => ({
    im: { message: { create: vi.fn().mockResolvedValue({ data: {} }) } },
  })),
  EventDispatcher: vi.fn().mockImplementation(() => ({ register: vi.fn() })),
}));

describe('FeishuChannel', () => {
  it('should have correct manifest', () => {
    const ch = new FeishuChannel({ appId: 'id', appSecret: 'secret' });
    expect(ch.manifest.name).toBe('feishu');
  });

  it('should normalize a Feishu message', () => {
    const ch = new FeishuChannel({ appId: 'id', appSecret: 'secret' });
    const msg = ch.normalizeMessage({
      sender: { sender_id: { open_id: 'ou_123' } },
      message: { chat_id: 'oc_456', content: JSON.stringify({ text: 'Hello Feishu' }), message_id: 'msg-1', create_time: '1700000000000' },
    });
    expect(msg.content.text).toBe('Hello Feishu');
    expect(msg.source.userId).toBe('ou_123');
  });
});
```

```typescript
// channels/feishu/src/feishuChannel.ts
import { BaseChannelPlugin } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import * as lark from '@larksuiteoapi/node-sdk';
import { randomUUID } from 'node:crypto';

export interface FeishuConfig { appId: string; appSecret: string; activationMode?: 'always' | 'mention' | 'reply'; }

export class FeishuChannel extends BaseChannelPlugin {
  manifest: PluginManifest = { name: 'feishu', version: '0.1.0', description: 'Feishu (Lark) channel for xclaw', type: 'channel' };
  private client: lark.Client;
  private readonly config: FeishuConfig;

  constructor(config: FeishuConfig) {
    super();
    this.config = config;
    this.client = new lark.Client({ appId: config.appId, appSecret: config.appSecret });
    if (config.activationMode) this.setActivationMode(config.activationMode);
  }

  async onLoad(): Promise<void> { /* EventDispatcher setup — webhook or long poll */ }
  async onUnload(): Promise<void> { /* cleanup */ }

  async send(msg: OutgoingMessage): Promise<void> {
    const chunks = this.chunkMessage(msg.content.text ?? '', 4096);
    for (const chunk of chunks) {
      await this.client.im.message.create({ data: { receive_id: msg.targetSessionId, msg_type: 'text', content: JSON.stringify({ text: chunk }) }, params: { receive_id_type: 'chat_id' } });
    }
  }

  normalizeMessage(raw: Record<string, unknown>): UnifiedMessage {
    const sender = raw.sender as Record<string, any> | undefined;
    const message = raw.message as Record<string, any> | undefined;
    let text = '';
    try { text = JSON.parse(message?.content ?? '{}').text ?? ''; } catch { /* ignore */ }
    return {
      id: randomUUID(),
      source: { channel: 'feishu', userId: sender?.sender_id?.open_id ?? 'unknown', sessionId: message?.chat_id ?? 'unknown' },
      content: { type: 'text', text },
      timestamp: parseInt(message?.create_time ?? '0', 10),
    };
  }
}
```

Commit: `feat(channels): implement Feishu channel — Lark SDK, text messaging`

---

### Task 6: WeCom Channel

**Files:** `channels/wecom/` (no external dep — uses native `fetch`)

```typescript
// channels/wecom/src/wecomChannel.test.ts
import { describe, it, expect, vi } from 'vitest';
import { WeComChannel } from './wecomChannel.js';

describe('WeComChannel', () => {
  it('should have correct manifest', () => {
    const ch = new WeComChannel({ corpId: 'id', secret: 'secret', agentId: 1000 });
    expect(ch.manifest.name).toBe('wecom');
  });

  it('should normalize a WeCom message', () => {
    const ch = new WeComChannel({ corpId: 'id', secret: 'secret', agentId: 1000 });
    const msg = ch.normalizeMessage({ FromUserName: 'user-1', MsgType: 'text', Content: 'Hello WeCom', CreateTime: 1700000000 });
    expect(msg.content.text).toBe('Hello WeCom');
    expect(msg.source.userId).toBe('user-1');
  });
});
```

```typescript
// channels/wecom/src/wecomChannel.ts
import { BaseChannelPlugin } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';
import { randomUUID } from 'node:crypto';

export interface WeComConfig { corpId: string; secret: string; agentId: number; activationMode?: 'always' | 'mention' | 'reply'; }

export class WeComChannel extends BaseChannelPlugin {
  manifest: PluginManifest = { name: 'wecom', version: '0.1.0', description: 'WeCom channel for xclaw', type: 'channel' };
  private accessToken = '';
  private readonly config: WeComConfig;

  constructor(config: WeComConfig) {
    super();
    this.config = config;
    if (config.activationMode) this.setActivationMode(config.activationMode);
  }

  async onLoad(): Promise<void> { await this.refreshToken(); }
  async onUnload(): Promise<void> { this.accessToken = ''; }

  async send(msg: OutgoingMessage): Promise<void> {
    const chunks = this.chunkMessage(msg.content.text ?? '', 2048);
    for (const chunk of chunks) {
      await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${this.accessToken}`, {
        method: 'POST',
        body: JSON.stringify({ touser: msg.targetUserId, msgtype: 'text', agentid: this.config.agentId, text: { content: chunk } }),
      });
    }
  }

  normalizeMessage(raw: Record<string, unknown>): UnifiedMessage {
    return {
      id: randomUUID(),
      source: { channel: 'wecom', userId: String(raw.FromUserName ?? 'unknown'), sessionId: String(raw.FromUserName ?? 'unknown') },
      content: { type: 'text', text: String(raw.Content ?? '') },
      timestamp: ((raw.CreateTime as number) ?? 0) * 1000,
    };
  }

  private async refreshToken(): Promise<void> {
    const res = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.corpId}&corpsecret=${this.config.secret}`);
    const data = await res.json() as Record<string, unknown>;
    this.accessToken = String(data.access_token ?? '');
  }
}
```

Commit: `feat(channels): implement WeCom channel — HTTP API, token refresh`

---

### Task 7: Google Chat Channel

**Files:** `channels/gchat/` (dep: `googleapis@^130.0.0`)

Test and implementation follow the same pattern. Key differences: uses `googleapis` for sending via Google Chat API, webhook for receiving. `normalizeMessage` extracts from Google Chat event format (`message.sender.name`, `message.text`, `space.name`). Max message length: 4096.

Commit: `feat(channels): implement Google Chat channel — googleapis, webhook`

---

### Task 8: Teams Channel

**Files:** `channels/teams/` (dep: `botbuilder@^4.0.0`)

Uses Microsoft Bot Framework's `botbuilder` package. `onLoad()` creates a `BotFrameworkAdapter` with app ID/password. Incoming messages arrive via HTTP webhook (`/api/messages`). `normalizeMessage` maps Teams `Activity` to `UnifiedMessage`. Max message length: 28000.

Commit: `feat(channels): implement Teams channel — botbuilder, webhook adapter`

---

### Task 9: Mattermost Channel

**Files:** `channels/mattermost/` (dep: `@mattermost/client@^9.0.0`)

Uses Mattermost client SDK. `onLoad()` authenticates via token and connects to WebSocket for real-time events. `normalizeMessage` maps Mattermost post format (`channel_id`, `user_id`, `message`). Max message length: 16383.

Commit: `feat(channels): implement Mattermost channel — WebSocket client, real-time events`

---

### Task 10: CLI Channel Commands

**Files:**
- Create: `packages/cli/src/commands/channel.ts`
- Create: `packages/cli/src/commands/channel.test.ts`
- Modify: `packages/cli/src/index.ts`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/commands/channel.test.ts
import { describe, it, expect } from 'vitest';
import { formatChannelList } from './channel.js';

describe('Channel CLI helpers', () => {
  it('should format channel list', () => {
    const channels = [
      { name: 'telegram', enabled: true },
      { name: 'discord', enabled: false },
      { name: 'cli', enabled: true },
    ];
    const output = formatChannelList(channels);
    expect(output).toContain('telegram');
    expect(output).toContain('enabled');
    expect(output).toContain('disabled');
  });

  it('should handle empty channel list', () => {
    const output = formatChannelList([]);
    expect(output).toContain('No channels');
  });
});
```

**Step 2: Implement CLI helpers**

```typescript
// packages/cli/src/commands/channel.ts
export interface ChannelStatus {
  name: string;
  enabled: boolean;
}

export function formatChannelList(channels: ChannelStatus[]): string {
  if (channels.length === 0) return 'No channels configured.';
  const lines = channels.map(
    (ch) => `  ${ch.name}  ${ch.enabled ? '[enabled]' : '[disabled]'}`,
  );
  return `Channels:\n${lines.join('\n')}`;
}
```

**Step 3: Register in CLI index**

Add `channel list/enable/disable` commands to `packages/cli/src/index.ts`.

**Step 4: Run test, verify pass, commit**

```bash
git add packages/cli/src/commands/channel.ts packages/cli/src/commands/channel.test.ts packages/cli/src/index.ts
git commit -m "feat(cli): add channel list/enable/disable CLI commands"
```

---

### Task 11: Integration Tests

**Files:**
- Create: `test/integration/channel-loading.test.ts`

Test that the channel dynamic loading mechanism works: create a mock channel config, verify it can be loaded via `import()`, wired to the pipeline, and messages flow through.

```bash
git add test/integration/channel-loading.test.ts
git commit -m "test: add channel dynamic loading integration test"
```

---

## Summary

After completing all 11 tasks, Phase 5 delivers:

- **SDK enhancements**: `chunkMessage()`, `getReconnectDelay()`, activation modes (`always`/`mention`/`reply`), `handleIncoming()` with mode filtering
- **8 channel plugins**: Telegram, Discord, Slack, Feishu, WeCom, Google Chat, Teams, Mattermost — each with normalizeMessage, send, chunking, mention detection
- **CLI commands**: `xclaw channel list/enable/disable`
- **Dynamic loading**: Config-driven channel loading at startup
- **Integration tests**: End-to-end channel loading verification
