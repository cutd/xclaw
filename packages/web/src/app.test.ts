// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('WebSocket', vi.fn(() => ({
  onopen: null, onclose: null, onmessage: null, onerror: null,
  send: vi.fn(), close: vi.fn(), readyState: 1,
})));

// Import after mock
import './app.js';

describe('XClawApp', () => {
  it('should render nav-bar and chat-view by default', async () => {
    const el = document.createElement('xclaw-app') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector('nav-bar')).not.toBeNull();
    expect(shadow.querySelector('chat-view')).not.toBeNull();
    expect(shadow.querySelector('dashboard-view')).toBeNull();
    document.body.removeChild(el);
  });

  it('should switch to dashboard on tab-change', async () => {
    const el = document.createElement('xclaw-app') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    const nav = el.shadowRoot!.querySelector('nav-bar') as any;
    nav.dispatchEvent(new CustomEvent('tab-change', { detail: 'dashboard', bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('dashboard-view')).not.toBeNull();
    expect(el.shadowRoot!.querySelector('chat-view')).toBeNull();
    document.body.removeChild(el);
  });
});
