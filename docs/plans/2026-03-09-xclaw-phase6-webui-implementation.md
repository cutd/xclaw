# Phase 6: Web UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a WebChat and Dashboard as a Lit Web Components package (`@xclaw/web`) that connects to the Gateway via WebSocket for real-time chat with markdown rendering and streaming, plus a system status dashboard.

**Architecture:** A new `packages/web/` package using Lit + Vite. A `GatewayClient` class wraps the WebSocket connection with reconnect and typed messages. Chat components handle streaming message blocks. The Gateway is extended with `status.query/response` for dashboard data.

**Tech Stack:** TypeScript 5.x, Lit 3.x, Vite 6.x, `marked` (markdown), `highlight.js` (code), Vitest + happy-dom (testing)

---

## Phase 6 Overview

```
Task 1:  Package scaffolding — package.json, vite.config, index.html, theme
Task 2:  GatewayClient — WebSocket wrapper with reconnect, typed messages
Task 3:  Gateway status endpoint — add status.query/response to server
Task 4:  Shared components — nav-bar, status-badge
Task 5:  Chat components — message-item (markdown), chat-view (streaming)
Task 6:  Dashboard components — channel-status, token-usage, dashboard-view
Task 7:  App shell — routing between chat and dashboard
Task 8:  Integration tests
```

---

### Task 1: Package Scaffolding

**Files:**
- Modify: `pnpm-workspace.yaml` (already includes `packages/*`, no change needed)
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/src/styles/theme.css`

**Step 1: Create package.json**

```json
{
  "name": "@xclaw/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "lit": "^3.2.0",
    "marked": "^15.0.0",
    "highlight.js": "^11.11.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0",
    "happy-dom": "^16.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "outDir": "./dist",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

**Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
  },
  test: {
    environment: 'happy-dom',
  },
});
```

**Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>xclaw</title>
  <link rel="stylesheet" href="/src/styles/theme.css" />
</head>
<body>
  <xclaw-app></xclaw-app>
  <script type="module" src="/src/app.ts"></script>
</body>
</html>
```

**Step 5: Create theme.css**

```css
:root {
  --color-bg: #1a1a2e;
  --color-surface: #16213e;
  --color-primary: #e94560;
  --color-text: #eaeaea;
  --color-text-muted: #8a8a8a;
  --color-border: #2a2a4a;
  --color-success: #4ade80;
  --color-warning: #facc15;
  --color-error: #f87171;
  --color-input-bg: #0f3460;
  --font-mono: 'SF Mono', 'Fira Code', monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --radius: 8px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--font-sans);
  background: var(--color-bg);
  color: var(--color-text);
  height: 100vh;
  overflow: hidden;
}
```

**Step 6: Create placeholder app.ts**

```typescript
// packages/web/src/app.ts
import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('xclaw-app')
export class XClawApp extends LitElement {
  static styles = css`
    :host { display: block; height: 100vh; }
    .container { display: flex; align-items: center; justify-content: center; height: 100%; color: #eaeaea; }
  `;

  render() {
    return html`<div class="container"><h1>xclaw</h1></div>`;
  }
}
```

**Step 7: Install deps and verify**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm install`
Run: `cd /Users/dateng/cutd_data/dev/xclaw/packages/web && npx vite build`
Expected: Build succeeds

**Step 8: Commit**

```bash
git add packages/web/ pnpm-lock.yaml
git commit -m "feat(web): scaffold @xclaw/web package — Lit, Vite, theme"
```

---

### Task 2: GatewayClient

**Files:**
- Create: `packages/web/src/gateway-client.ts`
- Create: `packages/web/src/gateway-client.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/web/src/gateway-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GatewayClient } from './gateway-client.js';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  send(data: string) { this.sent.push(data); }
  close() { this.readyState = MockWebSocket.CLOSED; }

  simulateOpen() { this.onopen?.(); }
  simulateMessage(data: object) { this.onmessage?.({ data: JSON.stringify(data) }); }
  simulateClose() { this.onclose?.(); }
}

describe('GatewayClient', () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket();
    vi.stubGlobal('WebSocket', vi.fn(() => mockWs));
  });

  it('should connect and emit connected state', () => {
    const client = new GatewayClient('ws://localhost:18789');
    client.connect();
    mockWs.simulateOpen();
    expect(client.state).toBe('connected');
  });

  it('should send typed messages', () => {
    const client = new GatewayClient('ws://localhost:18789');
    client.connect();
    mockWs.simulateOpen();
    client.sendChatMessage('Hello');
    expect(mockWs.sent).toHaveLength(1);
    const msg = JSON.parse(mockWs.sent[0]);
    expect(msg.type).toBe('chat.message');
    expect(msg.payload.text).toBe('Hello');
  });

  it('should receive and dispatch messages', () => {
    const client = new GatewayClient('ws://localhost:18789');
    const received: any[] = [];
    client.on('chat.response', (msg) => received.push(msg));
    client.connect();
    mockWs.simulateOpen();
    mockWs.simulateMessage({ type: 'chat.response', id: '1', payload: { text: 'Hi' }, timestamp: Date.now() });
    expect(received).toHaveLength(1);
    expect(received[0].payload.text).toBe('Hi');
  });

  it('should track disconnected state', () => {
    const client = new GatewayClient('ws://localhost:18789');
    client.connect();
    mockWs.simulateOpen();
    mockWs.simulateClose();
    expect(client.state).toBe('reconnecting');
  });

  it('should create session on connect', () => {
    const client = new GatewayClient('ws://localhost:18789');
    client.connect();
    mockWs.simulateOpen();
    // Should have sent session.create
    expect(mockWs.sent.length).toBeGreaterThanOrEqual(1);
    const sessionMsg = JSON.parse(mockWs.sent[0]);
    expect(sessionMsg.type).toBe('session.create');
  });
});
```

**Step 2: Implement GatewayClient**

```typescript
// packages/web/src/gateway-client.ts
export type ConnectionState = 'disconnected' | 'connected' | 'reconnecting';

export interface GatewayMessage {
  type: string;
  id: string;
  payload: Record<string, unknown>;
  timestamp: number;
  sessionId?: string;
}

type MessageHandler = (msg: GatewayMessage) => void;

export class GatewayClient {
  private url: string;
  private ws: WebSocket | null = null;
  private handlers = new Map<string, MessageHandler[]>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  state: ConnectionState = 'disconnected';
  sessionId = '';

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.state = 'connected';
      this.reconnectAttempt = 0;
      this.sendSessionCreate();
      this.emit('_connected', {} as any);
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as GatewayMessage;
        if (msg.type === 'session.create' && msg.payload.sessionId) {
          this.sessionId = msg.payload.sessionId as string;
        }
        this.emit(msg.type, msg);
      } catch { /* ignore malformed */ }
    };
    this.ws.onclose = () => {
      this.state = 'reconnecting';
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {};
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.state = 'disconnected';
  }

  sendChatMessage(text: string): void {
    this.send({ type: 'chat.message', id: crypto.randomUUID(), payload: { text }, timestamp: Date.now() });
  }

  sendStatusQuery(): void {
    this.send({ type: 'status.query', id: crypto.randomUUID(), payload: {}, timestamp: Date.now() });
  }

  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: MessageHandler): void {
    const list = this.handlers.get(type);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  private send(msg: GatewayMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private emit(type: string, msg: GatewayMessage): void {
    for (const handler of this.handlers.get(type) ?? []) {
      handler(msg);
    }
  }

  private sendSessionCreate(): void {
    this.send({ type: 'session.create', id: crypto.randomUUID(), payload: { userId: 'web-user', clientType: 'web' }, timestamp: Date.now() });
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}
```

**Step 3: Run tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run packages/web/src/gateway-client.test.ts`
Expected: PASS

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add packages/web/src/gateway-client.ts packages/web/src/gateway-client.test.ts
git commit -m "feat(web): add GatewayClient — WebSocket wrapper with reconnect, typed messages"
```

---

### Task 3: Gateway Status Endpoint

**Files:**
- Modify: `packages/core/src/gateway/types.ts` (add status.query/response to GatewayMessageType)
- Modify: `packages/core/src/gateway/server.ts` (handle status.query)
- Modify: `packages/core/src/runtime/runtime.ts` (expose status data to Gateway)
- Create: `packages/core/src/gateway/statusHandler.test.ts`

**Step 1: Add new message types**

Add to `GatewayMessageType` in `packages/core/src/gateway/types.ts`:
```typescript
| 'status.query'
| 'status.response'
```

**Step 2: Write the test**

```typescript
// packages/core/src/gateway/statusHandler.test.ts
import { describe, it, expect } from 'vitest';
import { buildStatusResponse } from './server.js';

describe('Status Response', () => {
  it('should build status payload with channels and uptime', () => {
    const status = buildStatusResponse({
      channels: ['telegram', 'discord'],
      sessions: 3,
      uptime: 12345,
    });
    expect(status.type).toBe('status.response');
    expect(status.payload.channels).toEqual(['telegram', 'discord']);
    expect(status.payload.sessions).toBe(3);
    expect(status.payload.uptime).toBe(12345);
  });
});
```

**Step 3: Add status handler to GatewayServer**

Add a `buildStatusResponse` exported function and handle `status.query` in the server's `handleMessage` switch. The runtime passes a `statusProvider` callback to the Gateway that returns current status data.

**Step 4: Run tests and commit**

```bash
git add packages/core/src/gateway/
git commit -m "feat(core): add status.query/response to Gateway protocol"
```

---

### Task 4: Shared Components

**Files:**
- Create: `packages/web/src/components/shared/nav-bar.ts`
- Create: `packages/web/src/components/shared/status-badge.ts`
- Create: `packages/web/src/components/shared/nav-bar.test.ts`

**Step 1: Implement status-badge**

```typescript
// packages/web/src/components/shared/status-badge.ts
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('status-badge')
export class StatusBadge extends LitElement {
  @property() status: 'connected' | 'reconnecting' | 'disconnected' = 'disconnected';

  static styles = css`
    :host { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem; }
    .dot { width: 8px; height: 8px; border-radius: 50%; }
    .dot.connected { background: var(--color-success, #4ade80); }
    .dot.reconnecting { background: var(--color-warning, #facc15); }
    .dot.disconnected { background: var(--color-error, #f87171); }
  `;

  render() {
    return html`<span class="dot ${this.status}"></span><span>${this.status}</span>`;
  }
}
```

**Step 2: Implement nav-bar**

```typescript
// packages/web/src/components/shared/nav-bar.ts
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import './status-badge.js';

@customElement('nav-bar')
export class NavBar extends LitElement {
  @property() activeTab: 'chat' | 'dashboard' = 'chat';
  @property() connectionStatus: 'connected' | 'reconnecting' | 'disconnected' = 'disconnected';

  static styles = css`
    :host { display: flex; align-items: center; justify-content: space-between; padding: 0 16px; height: 48px; background: var(--color-surface, #16213e); border-bottom: 1px solid var(--color-border, #2a2a4a); }
    .tabs { display: flex; gap: 16px; }
    .tab { cursor: pointer; padding: 4px 0; color: var(--color-text-muted, #8a8a8a); border: none; background: none; font-size: 0.95rem; font-family: inherit; }
    .tab.active { color: var(--color-text, #eaeaea); border-bottom: 2px solid var(--color-primary, #e94560); }
    .right { display: flex; align-items: center; gap: 12px; }
    .brand { font-weight: 700; color: var(--color-primary, #e94560); }
  `;

  render() {
    return html`
      <div class="tabs">
        <span class="brand">xclaw</span>
        <button class="tab ${this.activeTab === 'chat' ? 'active' : ''}" @click=${() => this.switchTab('chat')}>Chat</button>
        <button class="tab ${this.activeTab === 'dashboard' ? 'active' : ''}" @click=${() => this.switchTab('dashboard')}>Dashboard</button>
      </div>
      <div class="right">
        <status-badge .status=${this.connectionStatus}></status-badge>
      </div>
    `;
  }

  private switchTab(tab: 'chat' | 'dashboard') {
    this.dispatchEvent(new CustomEvent('tab-change', { detail: tab, bubbles: true, composed: true }));
  }
}
```

**Step 3: Write test**

```typescript
// packages/web/src/components/shared/nav-bar.test.ts
import { describe, it, expect } from 'vitest';
import './nav-bar.js';

describe('NavBar', () => {
  it('should render with default props', async () => {
    const el = document.createElement('nav-bar') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector('.brand')?.textContent).toBe('xclaw');
    expect(shadow.querySelector('.tab.active')?.textContent?.trim()).toBe('Chat');
    document.body.removeChild(el);
  });
});
```

**Step 4: Run tests and commit**

```bash
git add packages/web/src/components/shared/
git commit -m "feat(web): add shared components — nav-bar, status-badge"
```

---

### Task 5: Chat Components

**Files:**
- Create: `packages/web/src/components/chat/message-item.ts`
- Create: `packages/web/src/components/chat/chat-view.ts`
- Create: `packages/web/src/components/chat/message-item.test.ts`
- Create: `packages/web/src/components/chat/chat-view.test.ts`

**Step 1: Implement message-item**

A Lit component that renders a single message with:
- Sender (user/assistant) indicator
- Markdown body rendered via `marked` with `highlight.js` for code blocks
- Timestamp
- Streaming indicator (pulsing dot when `streaming=true`)

```typescript
// packages/web/src/components/chat/message-item.ts
import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { marked } from 'marked';
import hljs from 'highlight.js';

marked.setOptions({
  highlight: (code: string, lang: string) => {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
    return hljs.highlightAuto(code).value;
  },
});

@customElement('message-item')
export class MessageItem extends LitElement {
  @property() role: 'user' | 'assistant' | 'system' = 'user';
  @property() text = '';
  @property({ type: Boolean }) streaming = false;
  @property({ type: Number }) timestamp = 0;

  static styles = css`
    :host { display: block; padding: 12px 16px; }
    .message { max-width: 720px; margin: 0 auto; }
    .role { font-size: 0.8rem; font-weight: 600; margin-bottom: 4px; text-transform: capitalize; color: var(--color-text-muted, #8a8a8a); }
    .role.assistant { color: var(--color-primary, #e94560); }
    .body { line-height: 1.6; word-wrap: break-word; }
    .body :global(pre) { background: var(--color-input-bg, #0f3460); padding: 12px; border-radius: var(--radius, 8px); overflow-x: auto; }
    .body :global(code) { font-family: var(--font-mono); font-size: 0.9rem; }
    .streaming-dot { display: inline-block; width: 8px; height: 8px; background: var(--color-primary); border-radius: 50%; animation: pulse 1s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  `;

  render() {
    const rendered = this.text ? marked.parse(this.text) : '';
    return html`
      <div class="message">
        <div class="role ${this.role}">${this.role}</div>
        <div class="body">${unsafeHTML(rendered as string)}</div>
        ${this.streaming ? html`<span class="streaming-dot"></span>` : ''}
      </div>
    `;
  }
}
```

**Step 2: Implement chat-view**

```typescript
// packages/web/src/components/chat/chat-view.ts
import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import './message-item.js';
import type { GatewayClient, GatewayMessage } from '../../gateway-client.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  streaming: boolean;
  timestamp: number;
}

@customElement('chat-view')
export class ChatView extends LitElement {
  @property({ attribute: false }) client?: GatewayClient;
  @state() private messages: ChatMessage[] = [];
  @state() private inputText = '';
  @query('.message-list') private messageList?: HTMLElement;

  static styles = css`
    :host { display: flex; flex-direction: column; height: 100%; }
    .message-list { flex: 1; overflow-y: auto; padding: 16px 0; }
    .input-area { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--color-border, #2a2a4a); background: var(--color-surface, #16213e); }
    input { flex: 1; background: var(--color-input-bg, #0f3460); color: var(--color-text, #eaeaea); border: 1px solid var(--color-border, #2a2a4a); border-radius: var(--radius, 8px); padding: 10px 14px; font-size: 1rem; font-family: inherit; outline: none; }
    input:focus { border-color: var(--color-primary, #e94560); }
    button { background: var(--color-primary, #e94560); color: white; border: none; border-radius: var(--radius, 8px); padding: 10px 20px; cursor: pointer; font-size: 1rem; }
    button:hover { opacity: 0.9; }
    .empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--color-text-muted); }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.setupClientHandlers();
  }

  private setupClientHandlers() {
    if (!this.client) return;
    this.client.on('chat.response', (msg: GatewayMessage) => {
      this.messages = [...this.messages, { role: 'assistant', text: msg.payload.text as string ?? '', streaming: false, timestamp: msg.timestamp }];
      this.scrollToBottom();
    });
    this.client.on('chat.stream_start', () => {
      this.messages = [...this.messages, { role: 'assistant', text: '', streaming: true, timestamp: Date.now() }];
    });
    this.client.on('chat.stream_block', (msg: GatewayMessage) => {
      const last = this.messages[this.messages.length - 1];
      if (last?.streaming) {
        last.text += msg.payload.content as string ?? '';
        this.messages = [...this.messages];
        this.scrollToBottom();
      }
    });
    this.client.on('chat.stream_end', () => {
      const last = this.messages[this.messages.length - 1];
      if (last?.streaming) {
        last.streaming = false;
        this.messages = [...this.messages];
      }
    });
  }

  private handleSend() {
    const text = this.inputText.trim();
    if (!text || !this.client) return;
    this.messages = [...this.messages, { role: 'user', text, streaming: false, timestamp: Date.now() }];
    this.client.sendChatMessage(text);
    this.inputText = '';
    this.scrollToBottom();
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  }

  private scrollToBottom() {
    requestAnimationFrame(() => {
      if (this.messageList) this.messageList.scrollTop = this.messageList.scrollHeight;
    });
  }

  render() {
    return html`
      <div class="message-list">
        ${this.messages.length === 0
          ? html`<div class="empty">Start a conversation...</div>`
          : this.messages.map((m) => html`<message-item .role=${m.role} .text=${m.text} .streaming=${m.streaming} .timestamp=${m.timestamp}></message-item>`)}
      </div>
      <div class="input-area">
        <input type="text" placeholder="Type a message..." .value=${this.inputText} @input=${(e: Event) => this.inputText = (e.target as HTMLInputElement).value} @keydown=${this.handleKeyDown} />
        <button @click=${this.handleSend}>Send</button>
      </div>
    `;
  }
}
```

**Step 3: Write tests**

```typescript
// packages/web/src/components/chat/message-item.test.ts
import { describe, it, expect } from 'vitest';
import './message-item.js';

describe('MessageItem', () => {
  it('should render text content', async () => {
    const el = document.createElement('message-item') as any;
    el.role = 'user';
    el.text = 'Hello world';
    document.body.appendChild(el);
    await el.updateComplete;
    const body = el.shadowRoot!.querySelector('.body');
    expect(body?.textContent).toContain('Hello world');
    document.body.removeChild(el);
  });

  it('should render markdown', async () => {
    const el = document.createElement('message-item') as any;
    el.text = '**bold** text';
    document.body.appendChild(el);
    await el.updateComplete;
    const body = el.shadowRoot!.querySelector('.body');
    expect(body?.innerHTML).toContain('<strong>');
    document.body.removeChild(el);
  });

  it('should show streaming indicator', async () => {
    const el = document.createElement('message-item') as any;
    el.streaming = true;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.streaming-dot')).not.toBeNull();
    document.body.removeChild(el);
  });
});
```

```typescript
// packages/web/src/components/chat/chat-view.test.ts
import { describe, it, expect } from 'vitest';
import './chat-view.js';

describe('ChatView', () => {
  it('should render empty state', async () => {
    const el = document.createElement('chat-view') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.empty')?.textContent).toContain('Start a conversation');
    document.body.removeChild(el);
  });

  it('should render input area', async () => {
    const el = document.createElement('chat-view') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('input')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('button')).not.toBeNull();
    document.body.removeChild(el);
  });
});
```

**Step 4: Run tests and commit**

```bash
git add packages/web/src/components/chat/
git commit -m "feat(web): add chat components — message-item (markdown), chat-view (streaming)"
```

---

### Task 6: Dashboard Components

**Files:**
- Create: `packages/web/src/components/dashboard/channel-status.ts`
- Create: `packages/web/src/components/dashboard/token-usage.ts`
- Create: `packages/web/src/components/dashboard/dashboard-view.ts`
- Create: `packages/web/src/components/dashboard/dashboard-view.test.ts`

**Step 1: Implement channel-status**

A card component showing channel name and enabled/connected status.

**Step 2: Implement token-usage**

A summary component showing total input/output tokens.

**Step 3: Implement dashboard-view**

The main dashboard page that sends `status.query` via the GatewayClient, receives `status.response`, and renders channel cards + token summary + uptime.

**Step 4: Write test for dashboard-view rendering**

**Step 5: Run tests and commit**

```bash
git add packages/web/src/components/dashboard/
git commit -m "feat(web): add dashboard components — channel-status, token-usage, dashboard-view"
```

---

### Task 7: App Shell with Routing

**Files:**
- Modify: `packages/web/src/app.ts` (full app with nav + routing + gateway client)
- Create: `packages/web/src/app.test.ts`

**Step 1: Update app.ts**

Replace the placeholder with a full app shell that:
- Creates a `GatewayClient` and connects to the Gateway
- Renders `<nav-bar>` with connection status and tab switching
- Routes between `<chat-view>` and `<dashboard-view>` based on active tab
- Passes the client to child components

**Step 2: Write test**

```typescript
// packages/web/src/app.test.ts
import { describe, it, expect, vi } from 'vitest';

// Mock WebSocket for test environment
vi.stubGlobal('WebSocket', vi.fn(() => ({
  onopen: null, onclose: null, onmessage: null, onerror: null,
  send: vi.fn(), close: vi.fn(), readyState: 1,
})));

// Import after mock
import './app.js';

describe('XClawApp', () => {
  it('should render app shell', async () => {
    const el = document.createElement('xclaw-app') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector('nav-bar')).not.toBeNull();
    expect(shadow.querySelector('chat-view')).not.toBeNull();
    document.body.removeChild(el);
  });
});
```

**Step 3: Run tests and commit**

```bash
git add packages/web/src/app.ts packages/web/src/app.test.ts
git commit -m "feat(web): add app shell with routing — chat/dashboard tabs, gateway connection"
```

---

### Task 8: Integration Tests

**Files:**
- Create: `packages/web/src/integration.test.ts`

**Step 1: Write integration test**

Test the full flow: GatewayClient connect → send message → receive response → message list updates.

**Step 2: Run all tests**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && pnpm test -- --run`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add packages/web/src/integration.test.ts
git commit -m "test(web): add Web UI integration tests"
```

---

## Summary

After completing all 8 tasks, Phase 6 Web UI delivers:

- **Package scaffolding**: `@xclaw/web` with Lit, Vite, dark theme
- **GatewayClient**: WebSocket wrapper with reconnect, typed messages, session management
- **Gateway status endpoint**: `status.query/response` protocol extension
- **Shared components**: `<nav-bar>` with tabs and connection status, `<status-badge>`
- **Chat components**: `<message-item>` with markdown/code rendering, `<chat-view>` with streaming support
- **Dashboard components**: `<channel-status>` cards, `<token-usage>` summary, `<dashboard-view>`
- **App shell**: Client-side routing between Chat and Dashboard tabs
- **Tests**: Unit tests for all components, gateway client, and integration flow
