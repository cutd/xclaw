// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import './nav-bar.js';

describe('NavBar', () => {
  it('should render with default props', async () => {
    const el = document.createElement('nav-bar') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    const shadow = el.shadowRoot!;
    expect(shadow.querySelector('.brand')?.textContent).toBe('xclaw');
    expect(shadow.querySelector('.tab.active')?.textContent?.trim()).toBe('Chat');
    document.body.removeChild(el);
  });

  it('should render status badge', async () => {
    const el = document.createElement('nav-bar') as any;
    el.connectionStatus = 'connected';
    document.body.appendChild(el);
    await el.updateComplete;
    const badge = el.shadowRoot!.querySelector('status-badge') as any;
    expect(badge).not.toBeNull();
    await badge.updateComplete;
    expect(badge.status).toBe('connected');
    document.body.removeChild(el);
  });

  it('should dispatch tab-change event', async () => {
    const el = document.createElement('nav-bar') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    const events: string[] = [];
    el.addEventListener('tab-change', (e: CustomEvent) => events.push(e.detail));
    const dashboardTab = el.shadowRoot!.querySelectorAll('.tab')[1] as HTMLButtonElement;
    dashboardTab.click();
    expect(events).toEqual(['dashboard']);
    document.body.removeChild(el);
  });
});
