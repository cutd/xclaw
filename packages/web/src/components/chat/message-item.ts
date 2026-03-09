import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

const marked = new Marked(
  markedHighlight({
    highlight(code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
      return hljs.highlightAuto(code).value;
    },
  }),
);

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
    .body pre { background: var(--color-input-bg, #0f3460); padding: 12px; border-radius: var(--radius, 8px); overflow-x: auto; }
    .body code { font-family: var(--font-mono, 'SF Mono', 'Fira Code', monospace); font-size: 0.9rem; }
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
