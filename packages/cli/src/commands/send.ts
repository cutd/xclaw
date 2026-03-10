import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

export async function sendCommand(message: string, host = '127.0.0.1', port = 18789): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${host}:${port}`);
    const timeout = setTimeout(() => {
      ws.close();
      resolve('Timeout: no response from gateway.');
    }, 30000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'session.create', id: randomUUID(), payload: { userId: 'cli-send' }, timestamp: Date.now() }));
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'session.create') {
        ws.send(JSON.stringify({
          type: 'chat.message',
          id: randomUUID(),
          sessionId: msg.payload.sessionId,
          payload: { text: message },
          timestamp: Date.now(),
        }));
      } else if (msg.type === 'chat.response' || msg.payload?.text) {
        clearTimeout(timeout);
        ws.close();
        resolve(msg.payload?.text ?? msg.payload?.content ?? JSON.stringify(msg.payload));
      }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve('Could not connect to gateway. Is it running?');
    });
  });
}
