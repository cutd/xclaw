// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import './message-item.js';

describe('MessageItem', () => {
  it('should render text content', async () => {
    const el = document.createElement('message-item') as any;
    el.role = 'user';
    el.text = 'Hello world';
    document.body.appendChild(el);
    await el.updateComplete;
    const body = el.shadowRoot!.querySelector('.body');
    expect(body?.textContent).toContain('Hello world');
    document.body.removeChild(el);
  });

  it('should render markdown', async () => {
    const el = document.createElement('message-item') as any;
    el.text = '**bold** text';
    document.body.appendChild(el);
    await el.updateComplete;
    const body = el.shadowRoot!.querySelector('.body');
    expect(body?.innerHTML).toContain('<strong>');
    document.body.removeChild(el);
  });

  it('should show streaming indicator', async () => {
    const el = document.createElement('message-item') as any;
    el.streaming = true;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.streaming-dot')).not.toBeNull();
    document.body.removeChild(el);
  });

  it('should hide streaming indicator when not streaming', async () => {
    const el = document.createElement('message-item') as any;
    el.streaming = false;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.streaming-dot')).toBeNull();
    document.body.removeChild(el);
  });
});
