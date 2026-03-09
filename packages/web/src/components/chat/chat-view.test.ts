// @vitest-environment happy-dom
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
