import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { GatewayClient } from './gateway-client.js';
import type { ConnectionState } from './gateway-client.js';
import './components/shared/nav-bar.js';
import './components/chat/chat-view.js';
import './components/dashboard/dashboard-view.js';

@customElement('xclaw-app')
export class XClawApp extends LitElement {
  @state() private activeTab: 'chat' | 'dashboard' = 'chat';
  @state() private connectionStatus: ConnectionState = 'disconnected';

  private client: GatewayClient;

  constructor() {
    super();
    const wsUrl = import.meta.env.VITE_WS_URL ?? 'ws://127.0.0.1:18789';
    this.client = new GatewayClient(wsUrl);
  }

  static styles = css`
    :host { display: flex; flex-direction: column; height: 100vh; }
    .content { flex: 1; overflow: hidden; }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.client.on('_connected', () => {
      this.connectionStatus = this.client.state;
    });
    this.client.connect();
    this.pollConnectionStatus();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.client.disconnect();
  }

  private pollConnectionStatus() {
    setInterval(() => {
      if (this.connectionStatus !== this.client.state) {
        this.connectionStatus = this.client.state;
      }
    }, 1000);
  }

  private handleTabChange(e: CustomEvent<'chat' | 'dashboard'>) {
    this.activeTab = e.detail;
  }

  render() {
    return html`
      <nav-bar
        .activeTab=${this.activeTab}
        .connectionStatus=${this.connectionStatus}
        @tab-change=${this.handleTabChange}
      ></nav-bar>
      <div class="content">
        ${this.activeTab === 'chat'
          ? html`<chat-view .client=${this.client}></chat-view>`
          : html`<dashboard-view .client=${this.client}></dashboard-view>`}
      </div>
    `;
  }
}
