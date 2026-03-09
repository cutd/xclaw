import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './channel-status.js';
import './token-usage.js';
import type { GatewayClient, GatewayMessage } from '../../gateway-client.js';

interface StatusData {
  channels: string[];
  sessions: number;
  uptime: number;
}

@customElement('dashboard-view')
export class DashboardView extends LitElement {
  @property({ attribute: false }) client?: GatewayClient;
  @state() private status: StatusData | null = null;

  static styles = css`
    :host { display: block; height: 100%; overflow-y: auto; padding: 24px; }
    h2 { font-size: 1.2rem; margin-bottom: 16px; color: var(--color-text, #eaeaea); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .stats-row { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat-card { background: var(--color-surface, #16213e); border: 1px solid var(--color-border, #2a2a4a); border-radius: var(--radius, 8px); padding: 16px; flex: 1; }
    .stat-label { font-size: 0.8rem; color: var(--color-text-muted, #8a8a8a); }
    .stat-value { font-size: 1.4rem; font-weight: 700; font-family: var(--font-mono, monospace); }
    .loading { color: var(--color-text-muted, #8a8a8a); text-align: center; padding: 48px; }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.setupClientHandlers();
    this.requestStatus();
  }

  private setupClientHandlers() {
    if (!this.client) return;
    this.client.on('status.response', (msg: GatewayMessage) => {
      this.status = {
        channels: (msg.payload.channels as string[]) ?? [],
        sessions: (msg.payload.sessions as number) ?? 0,
        uptime: (msg.payload.uptime as number) ?? 0,
      };
    });
  }

  private requestStatus() {
    this.client?.sendStatusQuery();
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  }

  render() {
    if (!this.status) {
      return html`<div class="loading">Loading status...</div>`;
    }

    return html`
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-label">Active Sessions</div>
          <div class="stat-value">${this.status.sessions}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Uptime</div>
          <div class="stat-value">${this.formatUptime(this.status.uptime)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Channels</div>
          <div class="stat-value">${this.status.channels.length}</div>
        </div>
      </div>

      <h2>Channels</h2>
      <div class="grid">
        ${this.status.channels.map(
          (ch) => html`<channel-status .name=${ch} .enabled=${true}></channel-status>`
        )}
      </div>

      <token-usage .inputTokens=${0} .outputTokens=${0}></token-usage>
    `;
  }
}
