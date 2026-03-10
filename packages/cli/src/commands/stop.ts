import WebSocket from 'ws';

export async function stopCommand(host = '127.0.0.1', port = 18789): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${host}:${port}`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'gateway.stop', id: 'stop-1', payload: {}, timestamp: Date.now() }));
      ws.close();
      resolve('Shutdown signal sent.');
    });
    ws.on('error', () => {
      resolve('Could not connect to gateway. Is it running?');
    });
  });
}
