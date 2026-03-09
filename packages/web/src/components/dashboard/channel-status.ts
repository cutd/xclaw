import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('channel-status')
export class ChannelStatus extends LitElement {
  @property() name = '';
  @property({ type: Boolean }) enabled = false;

  static styles = css`
    :host { display: block; }
    .card { background: var(--color-surface, #16213e); border: 1px solid var(--color-border, #2a2a4a); border-radius: var(--radius, 8px); padding: 16px; display: flex; align-items: center; justify-content: space-between; }
    .name { font-weight: 600; text-transform: capitalize; }
    .status { font-size: 0.85rem; padding: 2px 8px; border-radius: 12px; }
    .status.enabled { background: var(--color-success, #4ade80); color: #000; }
    .status.disabled { background: var(--color-text-muted, #8a8a8a); color: #000; }
  `;

  render() {
    return html`
      <div class="card">
        <span class="name">${this.name}</span>
        <span class="status ${this.enabled ? 'enabled' : 'disabled'}">${this.enabled ? 'enabled' : 'disabled'}</span>
      </div>
    `;
  }
}
