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
      this.messages = [...this.messages, { role: 'assistant', text: (msg.payload.text as string) ?? '', streaming: false, timestamp: msg.timestamp }];
      this.scrollToBottom();
    });
    this.client.on('chat.stream_start', () => {
      this.messages = [...this.messages, { role: 'assistant', text: '', streaming: true, timestamp: Date.now() }];
    });
    this.client.on('chat.stream_block', (msg: GatewayMessage) => {
      const last = this.messages[this.messages.length - 1];
      if (last?.streaming) {
        last.text += (msg.payload.content as string) ?? '';
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
