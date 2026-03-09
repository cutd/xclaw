import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('token-usage')
export class TokenUsage extends LitElement {
  @property({ type: Number }) inputTokens = 0;
  @property({ type: Number }) outputTokens = 0;

  static styles = css`
    :host { display: block; }
    .card { background: var(--color-surface, #16213e); border: 1px solid var(--color-border, #2a2a4a); border-radius: var(--radius, 8px); padding: 16px; }
    h3 { font-size: 0.9rem; color: var(--color-text-muted, #8a8a8a); margin-bottom: 12px; }
    .stats { display: flex; gap: 24px; }
    .stat-label { font-size: 0.8rem; color: var(--color-text-muted, #8a8a8a); }
    .stat-value { font-size: 1.4rem; font-weight: 700; font-family: var(--font-mono, monospace); }
  `;

  render() {
    return html`
      <div class="card">
        <h3>Token Usage</h3>
        <div class="stats">
          <div>
            <div class="stat-label">Input</div>
            <div class="stat-value">${this.formatNumber(this.inputTokens)}</div>
          </div>
          <div>
            <div class="stat-label">Output</div>
            <div class="stat-value">${this.formatNumber(this.outputTokens)}</div>
          </div>
          <div>
            <div class="stat-label">Total</div>
            <div class="stat-value">${this.formatNumber(this.inputTokens + this.outputTokens)}</div>
          </div>
        </div>
      </div>
    `;
  }

  private formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }
}
