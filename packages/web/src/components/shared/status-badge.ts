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
