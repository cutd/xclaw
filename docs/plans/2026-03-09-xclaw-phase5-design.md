# Phase 5: Multi-Channel Implementation Design

## Goal

Implement the channel plugin SDK enhancements and 8 first-batch channel integrations (Telegram, Discord, Slack, Feishu, WeCom, Google Chat, Microsoft Teams, Mattermost), enabling xclaw to receive and respond to messages across all major messaging platforms.

## Architecture

### SDK Enhancements (`@xclaw/sdk`)

The existing `BaseChannelPlugin` is extended with shared capabilities that all channels inherit:

- **Reconnect logic** — exponential backoff with configurable base delay (1s), max delay (60s), and max attempts. `reconnect(attempt)` method returns a promise that resolves after the delay. Channels call this in their connection error handlers.
- **Message chunking** — `chunkMessage(text, maxLength)` splits long responses at paragraph boundaries first, then sentence boundaries, falling back to hard cut at `maxLength`. Each platform has a different limit (Telegram 4096, Discord 2000, Slack 40000, etc.).
- **Activation modes** — `'always' | 'mention' | 'reply'` enum. The `dispatchMessage()` method in `BaseChannelPlugin` checks the activation mode before forwarding to the message handler. In `mention` mode, only messages that mention the bot are forwarded. In `reply` mode, only direct replies to the bot's messages are forwarded. In `always` mode, all messages are forwarded.
- **BaseChannelConfig** — typed config interface with `enabled: boolean`, `activationMode`, `maxMessageLength`, `reconnectOptions`.

The existing `CLIChannel` is unaffected — these enhancements are opt-in via protected methods.

### Channel Package Structure

Each channel is a separate package under `channels/` in the monorepo:

```
channels/<name>/
  package.json            → @xclaw/channel-<name>
  src/
    index.ts              → exports the channel class
    <name>Channel.ts      → implements BaseChannelPlugin
    <name>Channel.test.ts → unit tests with mocked platform API
```

Each channel implements:
- `onLoad()` — authenticate, connect to platform API (polling/webhook/websocket)
- `onUnload()` — disconnect gracefully, flush pending messages
- `send(msg)` — convert `OutgoingMessage` to platform format, chunk if needed
- `normalizeMessage(raw)` — convert platform-specific incoming message to `UnifiedMessage`

### Platform Libraries

| Channel | Package Name | Library | Transport |
|---------|-------------|---------|-----------|
| Telegram | `@xclaw/channel-telegram` | `telegraf` | Long polling / webhook |
| Discord | `@xclaw/channel-discord` | `discord.js` | WebSocket gateway |
| Slack | `@xclaw/channel-slack` | `@slack/bolt` | Socket Mode / webhook |
| Feishu | `@xclaw/channel-feishu` | `@larksuiteoapi/node-sdk` | WebSocket |
| WeCom | `@xclaw/channel-wecom` | HTTP API (no lib) | Webhook callback |
| Google Chat | `@xclaw/channel-gchat` | `googleapis` | HTTP push / pub/sub |
| Teams | `@xclaw/channel-teams` | `botbuilder` | HTTP webhook |
| Mattermost | `@xclaw/channel-mattermost` | `@mattermost/client` | WebSocket |

### CLI Integration

New CLI subcommand:
- `xclaw channel list` — show installed channels and status
- `xclaw channel enable <name>` — enable in config
- `xclaw channel disable <name>` — disable in config

The `startCommand` is updated to dynamically load enabled channels:
1. Read config for enabled channels
2. `import()` each channel package dynamically
3. Call `onLoad()`, wire `onMessage` to pipeline
4. On shutdown, call `onUnload()` on each

### Configuration

Channel config in `xclaw.config.yaml`:
```yaml
channels:
  - name: telegram
    enabled: true
    config:
      token: "${XCLAW_TELEGRAM_TOKEN}"
      activationMode: mention
  - name: discord
    enabled: true
    config:
      token: "${XCLAW_DISCORD_TOKEN}"
      activationMode: mention
```

Tokens are resolved from environment variables at runtime.

### Testing Strategy

- **Unit tests** per channel: mock the platform library, verify `normalizeMessage` / `send` / lifecycle
- **SDK tests**: test chunking, reconnect logic, activation mode filtering
- **Integration test**: verify dynamic channel loading from config

### Error Handling

- Channel connection failures don't crash the gateway — logged and retried via reconnect
- Platform API errors during `send()` are caught, logged, and surfaced as `OutgoingMessage` delivery failures
- Unhandled errors in `normalizeMessage()` skip the malformed message with a warning log

## Implementation Order

1. SDK enhancements (reconnect, chunking, activation modes)
2. Telegram channel (most common, simplest API)
3. Discord channel
4. Slack channel
5. Feishu channel
6. WeCom channel
7. Google Chat channel
8. Teams channel
9. Mattermost channel
10. CLI channel commands + dynamic loading
11. Integration tests
