# Phase 2: Streaming, Presence & Config Hot-Reload Design

## Goal

Complete the Phase 2 gaps: provider-level LLM streaming, incremental text streaming through the agent layer, gateway stream forwarding, per-channel presence tracking, and config file hot-reload with broadcast.

## Architecture

Streaming flows bottom-up: Provider yields `StreamChunk` via `AsyncIterable` -> Agent iterates and emits `StreamBlock` via `StreamCallback` -> Pipeline passes callback through -> Gateway bridges to WebSocket `chat.stream_*` messages. Presence and config watcher are standalone modules integrated into the gateway and runtime respectively.

## Provider Streaming Interface

`packages/providers/src/base.ts`

### New Types

```typescript
export interface StreamChunk {
  type: 'text_delta' | 'tool_start' | 'tool_delta' | 'tool_end' | 'done';
  text?: string;
  toolCall?: Partial<ToolCall>;
  usage?: TokenUsage;
}
```

### Interface Extension

`chatStream` is added as an optional method on `LLMProvider`:

```typescript
export interface LLMProvider {
  readonly name: string;
  readonly models: readonly string[];
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream?(request: ChatRequest): AsyncIterable<StreamChunk>;
  validateApiKey(): Promise<boolean>;
}
```

Optional so existing providers don't break. The agent layer checks `if (provider.chatStream)` and falls back to `chat()` when not available.

### Anthropic Streaming Implementation

`packages/providers/src/anthropic.ts`

Uses the Anthropic SSE streaming API: `POST /v1/messages` with `"stream": true` in the request body. Parses Server-Sent Events:

- `content_block_start` (type: text) -> ignored (signals block start)
- `content_block_delta` (type: text_delta) -> yield `{ type: 'text_delta', text }`
- `content_block_start` (type: tool_use) -> yield `{ type: 'tool_start', toolCall: { name, id } }`
- `content_block_delta` (type: input_json_delta) -> yield `{ type: 'tool_delta', text: partialJson }`
- `content_block_stop` -> yield `{ type: 'tool_end' }`
- `message_delta` -> extract `stop_reason` and `usage`
- `message_stop` -> yield `{ type: 'done', usage }`

Implementation: `async *chatStream(request)` method. Uses `fetch()` with the same headers. Reads `res.body` (a `ReadableStream`) line by line, parsing SSE `data:` lines as JSON. An internal `parseSSEStream()` async generator handles the line-level parsing.

### OpenAI Provider

`packages/providers/src/openai.ts` -- **new file**

New `OpenAIProvider` class implementing `LLMProvider`. Supports both `chat()` and `chatStream()`.

```typescript
export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  readonly models = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'] as const;

  chat(request: ChatRequest): Promise<ChatResponse>;
  async *chatStream(request: ChatRequest): AsyncIterable<StreamChunk>;
  validateApiKey(): Promise<boolean>;
}
```

Uses the OpenAI Chat Completions API (`POST /v1/chat/completions`). Streaming uses `"stream": true` with SSE. Maps OpenAI `delta` chunks to `StreamChunk` types.

Message format conversion: Anthropic-style system prompt -> OpenAI `role: "system"` message. Tool schemas -> OpenAI `functions` format.

## Agent Streaming Integration

### Streaming Path in Agents

All three agent types (`StandardAgent`, `LightweightAgent`, `ExpertAgent`) gain a streaming code path:

1. Check `if (provider.chatStream)` at the start of `run()`.
2. **Streaming path:**
   - Call `provider.chatStream(request)` -> get `AsyncIterable<StreamChunk>`
   - `for await (const chunk of stream)`:
     - `text_delta` -> emit `onStream({ type: 'text', content: chunk.text })` and accumulate into response text
     - `tool_start` -> emit `onStream({ type: 'tool_start', toolName, toolArgs })`
     - `done` -> collect final usage
   - After stream ends, if tool calls received -> execute tools (existing tool loop) -> emit `tool_result` blocks -> call `chatStream` again for next turn
   - When no more tool calls -> emit `onStream({ type: 'done' })` -> return `AgentResult`
3. **Non-streaming fallback:** Existing `chat()` path unchanged.

### LLMProviderLike Extension

The `LLMProviderLike` interface (used by agent dispatcher) is extended with the optional `chatStream` method so the agent can access it.

### Key Change

Text `StreamBlock` emissions go from "once at the end with full content" to "incrementally per chunk as they arrive from the provider." This is the core difference that enables real-time text streaming to clients.

## Gateway Stream Forwarding

### Stream Bridge

When the runtime's `gateway.message` event handler receives a `chat.message`, it creates an `onStream` callback that bridges `StreamBlock` -> `GatewayMessage` -> WebSocket:

```
StreamBlock { type: 'text', content }     -> chat.stream_block { content }
StreamBlock { type: 'tool_start', ... }   -> chat.stream_block { toolName, toolArgs }
StreamBlock { type: 'tool_result', ... }  -> chat.stream_block { toolName, toolResult }
StreamBlock { type: 'done' }              -> chat.stream_end { usage }
```

On the first stream block received, the bridge sends `chat.stream_start` to the connection before forwarding the block.

### Implementation Location

The bridge logic lives in the runtime's event handler wiring (where `pipeline.process()` is called). It wraps the `onStream` callback and uses `gateway.sendTo(connectionId, message)` for each block.

### Web UI

No changes needed -- `packages/web/src/components/chat/chat-view.ts` already handles `chat.stream_start`, `chat.stream_block`, and `chat.stream_end` messages.

## Presence System

`packages/core/src/gateway/presence.ts`

### PresenceTracker Class

```typescript
interface PresenceEntry {
  userId: string;
  channel: string;
  connectionId: string;
  joinedAt: number;
}

class PresenceTracker {
  private entries = new Map<string, PresenceEntry>();  // keyed by connectionId

  join(connectionId: string, userId: string, channel: string): void;
  leave(connectionId: string): PresenceEntry | undefined;
  listByChannel(channel: string): PresenceEntry[];
  listAll(): PresenceEntry[];
}
```

### Integration with GatewayServer

- On `session.create` -> auto-join presence with userId and channel from session
- On WebSocket disconnect (`handleDisconnect`) -> auto-leave presence
- Handle `presence.list` message type -> return `presenceTracker.listByChannel(channel)` to requester

### Broadcast Behavior

When a user joins or leaves a channel, all other connections in the same channel receive a `presence.join` or `presence.leave` message with `{ userId, channel, connectionId }`. This enables real-time "who's online" displays.

The gateway gains a `broadcastToChannel(channel, message, excludeConnectionId?)` method for this purpose.

## Config Hot-Reload

`packages/core/src/config/watcher.ts`

### ConfigWatcher Class

```typescript
class ConfigWatcher {
  private watcher?: fs.FSWatcher;
  private debounceTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private configPath: string,
    private onChange: (newConfig: XClawConfig) => void,
    private debounceMs = 500,
  ) {}

  start(): void;   // fs.watch() on configPath
  stop(): void;     // close watcher, clear timer
}
```

### Behavior

- Uses `fs.watch()` on the `xclaw.yaml` config file
- Debounces changes (500ms default) to avoid rapid-fire reloads during editor save operations
- On change: re-reads the file, parses YAML, validates the new config structure
- If parse or validation fails: logs the error, keeps the current config (no crash, no reload)

### Integration with Runtime

- Runtime creates `ConfigWatcher` after loading the initial config
- `onChange` callback:
  1. Updates the runtime's config reference
  2. Re-configures affected subsystems (re-register providers if API key changed, update cron schedule if cron section changed, update webhook routes if webhooks changed)
  3. Broadcasts `config.update` message to all connected clients via gateway with `{ changedSections: string[] }`

### Hot-Reload Scope

| Hot-reloadable | Requires restart |
|----------------|-----------------|
| Model routing config | Gateway host/port |
| Provider API keys | |
| Cron job definitions | |
| Webhook configurations | |
| Channel settings | |

## Testing Strategy

| Component | Approach |
|-----------|----------|
| **Anthropic streaming** | Mock `fetch` to return SSE text streams. Test parsing of `content_block_delta`, `message_delta`, `message_stop` events. Test error mid-stream. Test tool use streaming. |
| **OpenAI provider** | Mock `fetch`. Test non-streaming `chat()`. Test SSE streaming parsing. Test `validateApiKey()`. Test message format conversion (system prompt, tools). |
| **Agent streaming** | Mock provider with `chatStream` returning async generator. Verify incremental `onStream` calls with `text` blocks (not one at end). Verify tool loop works with streaming. Test fallback to `chat()` when `chatStream` undefined. |
| **Gateway stream bridge** | Mock WebSocket. Verify `stream_start`/`stream_block`/`stream_end` messages sent in correct order. Verify content matches stream chunks. |
| **Presence** | Test join/leave/listByChannel. Test auto-leave on disconnect. Test broadcast to channel members. Test no cross-channel leakage. |
| **Config watcher** | Mock `fs.watch`. Test debounce (multiple rapid changes -> single reload). Test invalid YAML doesn't crash. Test onChange callback fires with parsed config. |

## Implementation Order

1. Provider streaming types + Anthropic `chatStream()` (foundation)
2. OpenAI provider (non-streaming `chat()` + streaming `chatStream()`)
3. Agent streaming integration (incremental text emission)
4. Gateway stream bridge (WebSocket forwarding)
5. Presence system (independent of streaming)
6. Config hot-reload (independent of streaming)
