import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import './status-badge.js';

@customElement('nav-bar')
export class NavBar extends LitElement {
  @property() activeTab: 'chat' | 'dashboard' = 'chat';
  @property() connectionStatus: 'connected' | 'reconnecting' | 'disconnected' = 'disconnected';

  static styles = css`
    :host { display: flex; align-items: center; justify-content: space-between; padding: 0 16px; height: 48px; background: var(--color-surface, #16213e); border-bottom: 1px solid var(--color-border, #2a2a4a); }
    .tabs { display: flex; gap: 16px; align-items: center; }
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
