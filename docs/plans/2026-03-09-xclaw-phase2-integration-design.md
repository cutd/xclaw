# Phase 2: Integration Wiring Design

## Goal

Wire the existing Gateway, Agent, Sandbox, and Pipeline components into a unified `XClawRuntime` orchestrator that boots the full system from a YAML config file, dynamically loads enabled channels, and routes messages through the pipeline.

## Background

Phase 1 built all core components as isolated modules:
- **Gateway** (`packages/core/src/gateway/server.ts`): WebSocket server with session management, heartbeat, presence
- **Agent system** (`packages/core/src/agent/`): 3-tier dispatcher (Lightweight/Standard/Expert) with tool execution
- **Sandbox** (`packages/core/src/sandbox/manager.ts`): Multi-backend isolation (bwrap, macOS, VM) with 3 modes
- **Pipeline** (`packages/core/src/gateway/pipeline.ts`): Full message flow (Security -> Router -> Context -> Memory -> Agent -> Audit)
- **Channels** (Phase 5): 8 platform channels + CLI, all extending `BaseChannelPlugin`

The `startCommand` in `packages/cli/src/commands/start.ts` currently hardcodes all wiring and only connects the CLI channel. This phase replaces that with a config-driven orchestrator.

## Architecture

### XClawRuntime Orchestrator

New class at `packages/core/src/runtime/runtime.ts`:

```
XClawRuntime
  +-- loadConfig(path)  -> read xclaw.config.yaml, resolve env vars
  +-- start()           -> boot subsystems in order:
  |     1. EventBus
  |     2. ProviderRegistry (configured providers)
  |     3. SandboxManager
  |     4. Agents (Lightweight/Standard/Expert) + Dispatcher
  |     5. MessagePipeline (Security -> Router -> Context -> Memory -> Agent)
  |     6. GatewayServer.start()
  |     7. Dynamic channel loading (import enabled channels)
  |     8. Wire channels: onMessage -> Pipeline -> channel.send()
  |     9. Wire Gateway: message events -> Pipeline -> gateway.sendTo()
  +-- stop()            -> graceful shutdown in reverse order
  +-- getStatus()       -> health check (channels, sessions, uptime)
```

### Config File

Location: `~/.xclaw/xclaw.config.yaml` (or `XCLAW_CONFIG` env var).

```yaml
gateway:
  host: 127.0.0.1
  port: 18789
  heartbeatIntervalMs: 30000

providers:
  - name: anthropic
    apiKey: "${XCLAW_ANTHROPIC_KEY}"

channels:
  - name: telegram
    enabled: true
    config:
      token: "${XCLAW_TELEGRAM_TOKEN}"
      activationMode: mention
  - name: discord
    enabled: false
    config:
      token: "${XCLAW_DISCORD_TOKEN}"

sandbox:
  defaultMode: passthrough

agents:
  tierModels:
    trivial: claude-haiku-3-5
    simple: claude-sonnet-4-5
    standard: claude-sonnet-4-5
    complex: claude-opus-4-6
  defaultModel: claude-sonnet-4-5
```

Environment variable placeholders (`${VAR}`) are resolved from `process.env` at load time.

### Config Loader

New module at `packages/core/src/runtime/configLoader.ts`:
- Reads YAML file using the `yaml` package
- Resolves `${ENV_VAR}` placeholders from `process.env`
- Validates required fields
- Returns typed `XClawConfig`

### Channel Wiring

Generic `wireChannel(channel)` method on `XClawRuntime`:
1. `channel.onMessage(async (msg) => { result = await pipeline.process(msg); await channel.send(result); })`
2. `channel.onLoad()`
3. Stores in `Map<string, BaseChannelPlugin>`
4. On shutdown: iterates channels, calls `onUnload()`

Dynamic loading:
1. For each enabled channel in config: `const mod = await import(`@xclaw/channel-${name}`)`
2. Find the exported class extending `BaseChannelPlugin`
3. Instantiate with config, call `wireChannel()`
4. Failed loads log a warning but don't crash

CLI channel is always loaded regardless of config.

### Gateway Integration

The Gateway WebSocket server starts alongside channels:
- Web/App clients connect via WebSocket, create sessions, send chat messages
- `gateway.message` event -> Pipeline -> response via `gateway.sendTo(connectionId)`
- The EventBus bridges Gateway events to the Pipeline

### Message Flow

```
External channel     -->  channel.handleIncoming()  -->  Pipeline.process()  -->  channel.send()
WebSocket client     -->  Gateway message event      -->  Pipeline.process()  -->  gateway.sendTo()
CLI                  -->  dispatchMessage()          -->  Pipeline.process()  -->  cliChannel.send()
```

### Updated startCommand

The CLI `startCommand` becomes thin:

```typescript
const runtime = new XClawRuntime();
await runtime.loadConfig(configPath);
await runtime.start();
// CLI channel is auto-loaded by runtime
```

### Testing Strategy

- **Unit tests**: ConfigLoader (YAML parsing, env resolution, validation), XClawRuntime lifecycle (start/stop order), wireChannel with mock channels
- **Integration tests**: Full runtime boot with mock config + mock channels, message flow end-to-end

### Error Handling

- Config file not found: create default config with CLI-only setup
- Invalid YAML: error with line number
- Missing env vars: warning log, channel skipped
- Channel load failure: warning log, other channels continue
- Gateway port in use: error with suggestion to change port

## Implementation Order

1. ConfigLoader (YAML parsing, env resolution)
2. XClawRuntime class (lifecycle orchestration)
3. Channel wiring (dynamic import + wireChannel)
4. Gateway integration (wire Gateway events to Pipeline)
5. Updated startCommand (thin wrapper)
6. Integration tests
