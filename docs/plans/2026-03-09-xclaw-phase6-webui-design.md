# Phase 6: Web UI Design

## Goal

Build a WebChat interface and Dashboard as a Lit Web Components package (`@xclaw/web`) that connects to the Gateway via WebSocket for real-time chat and system status monitoring.

## Architecture

### Package Structure

New package at `packages/web/` in the monorepo:

```
packages/web/
  package.json          -> @xclaw/web
  vite.config.ts        -> Vite dev server + build
  index.html            -> Entry point
  src/
    app.ts              -> Main app shell with client-side routing
    gateway-client.ts   -> WebSocket client (typed, reconnecting)
    components/
      chat/
        chat-view.ts    -> Chat interface (message list + input)
        message-item.ts -> Single message (markdown + code highlighting)
      dashboard/
        dashboard-view.ts -> Overview dashboard
        channel-status.ts -> Channel status cards
        token-usage.ts    -> Token usage summary
      shared/
        nav-bar.ts      -> Top navigation with connection status
        status-badge.ts -> Connected/reconnecting/disconnected indicator
    styles/
      theme.css         -> CSS custom properties for dark/light themes
```

### Gateway Client

`gateway-client.ts` wraps the WebSocket connection to the Gateway:

- Connects to `ws://127.0.0.1:18789` (configurable)
- Auto-reconnects with exponential backoff on disconnect
- Typed send/receive methods for all `GatewayMessage` types
- Event emitter pattern for incoming messages
- Creates a session on connect (`session.create`)
- Tracks connection state: `connected | reconnecting | disconnected`

### WebChat

The chat view is the primary interface:

- **Message list**: Scrollable container of `<message-item>` elements. Each renders Markdown content using `marked` for parsing and `highlight.js` for code syntax highlighting.
- **Input area**: Text input with send button. Enter sends, Shift+Enter adds newline.
- **Streaming**: Handles Gateway stream protocol (`chat.stream_start` -> `chat.stream_block` -> `chat.stream_end`). The latest message updates in real-time as blocks arrive.
- **Session**: Created automatically on WebSocket connect. Connection status shown in the nav bar.

Message flow:
```
User types message -> gateway-client.send(chat.message) -> WebSocket -> Gateway
                                                                          |
                                                                      Pipeline
                                                                          |
Message list <- gateway-client receives(chat.response/stream) <- WebSocket
```

### Dashboard

A status overview page with:

- Channel status cards (name, enabled/disabled, connection state)
- Token usage summary (total input/output from audit data)
- Active sessions count
- Runtime uptime

Queries the Gateway via a new `status.query` / `status.response` message type pair.

### Serving

**Development**: Vite dev server with HMR. WebSocket connection points to the running Gateway.

**Production**: `vite build` outputs static files to `packages/web/dist/`. The Gateway serves these via a small HTTP endpoint alongside the WebSocket server (e.g., `http://127.0.0.1:18790/`).

### Dependencies

- `lit` — Web Components framework
- `marked` — Markdown parsing
- `highlight.js` — Code syntax highlighting
- `vite` — Build tool and dev server

### Testing

- **Gateway client**: Unit tests with mocked WebSocket (connect, send, receive, reconnect)
- **Components**: Vitest + happy-dom for Lit component rendering tests
- **Integration**: Manual testing against a running Gateway

### New Gateway Protocol Messages

Add to the existing `GatewayMessageType`:

```
status.query    -> client requests system status
status.response -> server returns channels, sessions, uptime, token usage
```

## Implementation Order

1. Package scaffolding (package.json, vite.config, index.html, theme)
2. Gateway client (WebSocket wrapper with reconnect, typed messages)
3. Gateway status endpoint (status.query/response handler)
4. Shared components (nav-bar, status-badge)
5. Chat components (message-item with markdown, chat-view with streaming)
6. Dashboard components (channel-status, token-usage, dashboard-view)
7. App shell with routing (chat/dashboard pages)
8. Production serving (Gateway HTTP static file server)
9. Integration tests
