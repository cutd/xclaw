// test/integration/channel-loading.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BaseChannelPlugin } from '@xclaw/sdk';
import type { PluginManifest, OutgoingMessage, UnifiedMessage } from '@xclaw/core';

// Mock all external dependencies that channel packages import at the top level.
// Each channel constructor instantiates its SDK client, so we need stubs that
// don't throw when `new`-ed or called.

vi.mock('telegraf', () => ({
  Telegraf: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    launch: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    telegram: { sendMessage: vi.fn().mockResolvedValue({ message_id: 1 }) },
    botInfo: { id: 123, is_bot: true, first_name: 'xclaw', username: 'xclaw_bot' },
  })),
}));

vi.mock('discord.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    login: vi.fn().mockResolvedValue('token'),
    destroy: vi.fn(),
    user: { id: 'bot-123', username: 'xclaw' },
    channels: { fetch: vi.fn() },
  })),
  GatewayIntentBits: { Guilds: 1, GuildMessages: 2, MessageContent: 4, DirectMessages: 8 },
  Partials: { Channel: 0 },
}));

vi.mock('@slack/bolt', () => ({
  App: vi.fn().mockImplementation(() => ({
    message: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    client: { chat: { postMessage: vi.fn().mockResolvedValue({ ok: true }) } },
  })),
}));

vi.mock('@larksuiteoapi/node-sdk', () => ({
  Client: vi.fn().mockImplementation(() => ({
    im: {
      message: {
        create: vi.fn().mockResolvedValue({}),
      },
    },
  })),
}));

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({})),
    },
    chat: vi.fn().mockReturnValue({
      spaces: { messages: { create: vi.fn().mockResolvedValue({}) } },
    }),
  },
}));

vi.mock('botbuilder', () => ({
  CloudAdapter: vi.fn().mockImplementation(() => ({
    continueConversationAsync: vi.fn().mockResolvedValue(undefined),
  })),
  ConfigurationBotFrameworkAuthentication: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@mattermost/client', () => ({
  Client4: vi.fn().mockImplementation(() => ({
    setUrl: vi.fn(),
    setToken: vi.fn(),
    getMe: vi.fn().mockResolvedValue({ id: 'bot-1', username: 'xclaw' }),
    createPost: vi.fn().mockResolvedValue({}),
  })),
  WebSocketClient: vi.fn().mockImplementation(() => ({
    addMessageListener: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  })),
}));

// Channel metadata: package names, exported class names, manifest names, and
// minimal config objects needed to construct each channel.
const channelSpecs = [
  {
    pkg: '@xclaw/channel-telegram',
    exportName: 'TelegramChannel',
    manifestName: 'telegram',
    config: { token: 'fake', enabled: true },
  },
  {
    pkg: '@xclaw/channel-discord',
    exportName: 'DiscordChannel',
    manifestName: 'discord',
    config: { token: 'fake', enabled: true },
  },
  {
    pkg: '@xclaw/channel-slack',
    exportName: 'SlackChannel',
    manifestName: 'slack',
    config: { token: 'fake', appToken: 'xapp-fake', signingSecret: 'fake', enabled: true },
  },
  {
    pkg: '@xclaw/channel-feishu',
    exportName: 'FeishuChannel',
    manifestName: 'feishu',
    config: { appId: 'fake', appSecret: 'fake', enabled: true },
  },
  {
    pkg: '@xclaw/channel-wecom',
    exportName: 'WeComChannel',
    manifestName: 'wecom',
    config: { corpId: 'fake', secret: 'fake', agentId: 1, enabled: true },
  },
  {
    pkg: '@xclaw/channel-gchat',
    exportName: 'GChatChannel',
    manifestName: 'gchat',
    config: { serviceAccountKey: '{}', enabled: true },
  },
  {
    pkg: '@xclaw/channel-teams',
    exportName: 'TeamsChannel',
    manifestName: 'teams',
    config: { appId: 'fake', appPassword: 'fake', enabled: true },
  },
  {
    pkg: '@xclaw/channel-mattermost',
    exportName: 'MattermostChannel',
    manifestName: 'mattermost',
    config: { url: 'https://mm.example.com', token: 'fake', enabled: true },
  },
] as const;

// ---------------------------------------------------------------------------
// Test: Dynamic import of every channel package
// ---------------------------------------------------------------------------
describe('Channel Dynamic Loading', () => {
  it('should dynamically import all channel packages', async () => {
    for (const spec of channelSpecs) {
      const mod = await import(spec.pkg);
      // Each module should export a class extending BaseChannelPlugin
      const exportedClass = Object.values(mod).find(
        (val) => typeof val === 'function' && (val as Function).prototype instanceof BaseChannelPlugin,
      ) as (new (...args: any[]) => BaseChannelPlugin) | undefined;

      expect(exportedClass, `${spec.pkg} should export a class extending BaseChannelPlugin`).toBeDefined();
      expect(exportedClass!.name).toBe(spec.exportName);
    }
  });

  it('should instantiate each channel with config and verify manifest', async () => {
    for (const spec of channelSpecs) {
      const mod = await import(spec.pkg);
      const ChannelClass = mod[spec.exportName] as new (cfg: any) => BaseChannelPlugin;
      const instance = new ChannelClass(spec.config);

      expect(instance).toBeInstanceOf(BaseChannelPlugin);
      expect(instance.manifest.name).toBe(spec.manifestName);
      expect(instance.manifest.type).toBe('channel');
      expect(instance.manifest.version).toBe('0.1.0');
    }
  });

  // -------------------------------------------------------------------------
  // Test: Message flow from channel to handler
  // -------------------------------------------------------------------------
  it('should wire message flow from channel to handler', async () => {
    // Use a concrete mock channel to avoid dependency on any one real channel
    class MockChannel extends BaseChannelPlugin {
      manifest: PluginManifest = { name: 'mock', version: '0.1.0', description: 'Mock', type: 'channel' };
      async onLoad(): Promise<void> {}
      async onUnload(): Promise<void> {}
      async send(_msg: OutgoingMessage): Promise<void> {}
    }

    const channel = new MockChannel();
    const received: UnifiedMessage[] = [];

    channel.onMessage(async (msg) => {
      received.push(msg);
    });

    channel.setActivationMode('always');
    await channel.handleIncoming(
      {
        id: '1',
        source: { channel: 'mock', userId: 'u1', sessionId: 's1' },
        content: { type: 'text', text: 'test' },
        timestamp: Date.now(),
      },
      { isMention: false, isReply: false },
    );

    expect(received).toHaveLength(1);
    expect(received[0].content.text).toBe('test');
  });

  // -------------------------------------------------------------------------
  // Test: Activation mode filtering
  // -------------------------------------------------------------------------
  it('should respect activation mode filtering', async () => {
    class MockChannel extends BaseChannelPlugin {
      manifest: PluginManifest = { name: 'mock', version: '0.1.0', description: 'Mock', type: 'channel' };
      async onLoad(): Promise<void> {}
      async onUnload(): Promise<void> {}
      async send(_msg: OutgoingMessage): Promise<void> {}
    }

    const channel = new MockChannel();
    const received: UnifiedMessage[] = [];

    channel.onMessage(async (msg) => {
      received.push(msg);
    });
    channel.setActivationMode('mention');

    const msg: UnifiedMessage = {
      id: '1',
      source: { channel: 'mock', userId: 'u1', sessionId: 's1' },
      content: { type: 'text', text: 'test' },
      timestamp: Date.now(),
    };

    // Should NOT dispatch when activation mode is 'mention' but context says isMention=false
    await channel.handleIncoming(msg, { isMention: false, isReply: false });
    expect(received).toHaveLength(0);

    // Should dispatch when isMention=true
    await channel.handleIncoming(msg, { isMention: true, isReply: false });
    expect(received).toHaveLength(1);
  });

  it('should respect reply activation mode', async () => {
    class MockChannel extends BaseChannelPlugin {
      manifest: PluginManifest = { name: 'mock', version: '0.1.0', description: 'Mock', type: 'channel' };
      async onLoad(): Promise<void> {}
      async onUnload(): Promise<void> {}
      async send(_msg: OutgoingMessage): Promise<void> {}
    }

    const channel = new MockChannel();
    const received: UnifiedMessage[] = [];

    channel.onMessage(async (msg) => {
      received.push(msg);
    });
    channel.setActivationMode('reply');

    const msg: UnifiedMessage = {
      id: '2',
      source: { channel: 'mock', userId: 'u1', sessionId: 's1' },
      content: { type: 'text', text: 'hello' },
      timestamp: Date.now(),
    };

    // Should NOT dispatch when mode is 'reply' and isReply=false
    await channel.handleIncoming(msg, { isMention: true, isReply: false });
    expect(received).toHaveLength(0);

    // Should dispatch when isReply=true
    await channel.handleIncoming(msg, { isMention: false, isReply: true });
    expect(received).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Test: Config-driven channel loading
  // -------------------------------------------------------------------------
  it('should load config-driven channels (only enabled)', async () => {
    // Simulate a config object like xclaw.config.ts would have
    const config = {
      channels: [
        { name: 'telegram', enabled: true, config: { token: 'fake' } },
        { name: 'discord', enabled: false, config: { token: 'fake' } },
        { name: 'slack', enabled: true, config: { token: 'fake', appToken: 'xapp-fake', signingSecret: 'fake' } },
      ],
    };

    const loadedChannels: string[] = [];

    for (const ch of config.channels) {
      if (!ch.enabled) continue;
      try {
        const mod = await import(`@xclaw/channel-${ch.name}`);
        const ChannelClass = Object.values(mod).find(
          (val) => typeof val === 'function' && (val as Function).prototype instanceof BaseChannelPlugin,
        ) as (new (cfg: any) => BaseChannelPlugin) | undefined;

        if (ChannelClass) {
          const instance = new ChannelClass({ ...ch.config, enabled: true });
          expect(instance.manifest.name).toBe(ch.name);
          loadedChannels.push(ch.name);
        }
      } catch (err) {
        throw new Error(`Failed to load channel ${ch.name}: ${err}`);
      }
    }

    // Only enabled channels should be loaded
    expect(loadedChannels).toEqual(['telegram', 'slack']);
    expect(loadedChannels).not.toContain('discord');
  });

  // -------------------------------------------------------------------------
  // Test: Message flow through a real (mocked-dep) channel instance
  // -------------------------------------------------------------------------
  it('should flow messages through a real channel instance', async () => {
    const { TelegramChannel } = await import('@xclaw/channel-telegram');
    const channel = new TelegramChannel({ token: 'fake', enabled: true });
    const received: UnifiedMessage[] = [];

    channel.onMessage(async (msg) => {
      received.push(msg);
    });
    channel.setActivationMode('always');

    // Simulate an incoming message that the channel would normalize and dispatch
    const normalized = channel.normalizeMessage({
      message: {
        message_id: 42,
        from: { id: 111, first_name: 'User' },
        chat: { id: 222, type: 'private' },
        text: 'Hello from Telegram',
        date: 1700000000,
      },
    });

    await channel.handleIncoming(normalized, { isMention: false, isReply: false });

    expect(received).toHaveLength(1);
    expect(received[0].content.text).toBe('Hello from Telegram');
    expect(received[0].source.channel).toBe('telegram');
  });
});
