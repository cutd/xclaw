import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

export async function statusCommand(host = '127.0.0.1', port = 18789): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${host}:${port}`);
    const timeout = setTimeout(() => {
      ws.close();
      resolve('Timeout: no response from gateway.');
    }, 5000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'status.query', id: randomUUID(), payload: {}, timestamp: Date.now() }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'status.response') {
        clearTimeout(timeout);
        ws.close();
        const p = msg.payload;
        const uptimeSec = Math.floor((p.uptime ?? 0) / 1000);
        const lines = [
          'xclaw status:',
          `  Uptime: ${uptimeSec}s`,
          `  Sessions: ${p.sessions ?? 0}`,
          `  Channels: ${(p.channels ?? []).join(', ') || 'none'}`,
        ];
        resolve(lines.join('\n'));
      }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve('Could not connect to gateway. Is it running?');
    });
  });
}
