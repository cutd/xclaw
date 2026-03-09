// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import './dashboard-view.js';

describe('DashboardView', () => {
  it('should render loading state without client', async () => {
    const el = document.createElement('dashboard-view') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.loading')?.textContent).toContain('Loading status');
    document.body.removeChild(el);
  });

  it('should render status data when set', async () => {
    const el = document.createElement('dashboard-view') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    // Manually set status to simulate receiving data
    (el as any).status = { channels: ['telegram', 'discord'], sessions: 5, uptime: 3661000 };
    await el.updateComplete;
    const cards = el.shadowRoot!.querySelectorAll('channel-status');
    expect(cards.length).toBe(2);
    const statValues = el.shadowRoot!.querySelectorAll('.stat-value');
    expect(statValues[0]?.textContent).toBe('5'); // sessions
    expect(statValues[1]?.textContent).toBe('1h 1m 1s'); // uptime
    expect(statValues[2]?.textContent).toBe('2'); // channels count
    document.body.removeChild(el);
  });
});
