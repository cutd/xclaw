import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { GatewayServer } from './server.js';
import { EventBus } from '../events/eventBus.js';
import type { GatewayMessage } from './types.js';

function sendAndReceive(ws: WebSocket, msg: GatewayMessage): Promise<GatewayMessage> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()) as GatewayMessage);
    });
    ws.send(JSON.stringify(msg));
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
    } else {
      ws.once('open', () => resolve());
    }
  });
}

describe('GatewayServer', () => {
  let server: GatewayServer;
  let eventBus: EventBus;
  const port = 18799; // test port

  beforeEach(async () => {
    eventBus = new EventBus();
    server = new GatewayServer({
      config: {
        host: '127.0.0.1',
        port,
        heartbeatIntervalMs: 60000,
        heartbeatTimeoutMs: 10000,
      },
      eventBus,
    });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should accept WebSocket connections', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('should respond to ping with pong', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(ws);

    const response = await sendAndReceive(ws, {
      type: 'ping',
      id: 'p1',
      payload: {},
      timestamp: Date.now(),
    });

    expect(response.type).toBe('pong');
    ws.close();
  });

  it('should create a session', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(ws);

    const response = await sendAndReceive(ws, {
      type: 'session.create',
      id: 's1',
      payload: { userId: 'user-1', channel: 'cli' },
      timestamp: Date.now(),
    });

    expect(response.type).toBe('session.create');
    expect(response.payload.sessionId).toBeDefined();
    expect(server.sessions.listAll()).toHaveLength(1);
    ws.close();
  });

  it('should emit gateway.message for chat messages', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(ws);

    // First create a session
    await sendAndReceive(ws, {
      type: 'session.create',
      id: 's1',
      payload: { userId: 'user-1', channel: 'cli' },
      timestamp: Date.now(),
    });

    const received = vi.fn();
    eventBus.on('gateway.message', received);

    // Send a chat message
    ws.send(JSON.stringify({
      type: 'chat.message',
      id: 'c1',
      payload: { text: 'hello' },
      timestamp: Date.now(),
    }));

    // Wait a tick for the async handler
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveBeenCalled();
    ws.close();
  });

  it('should return error for invalid JSON', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(ws);

    const response = await new Promise<GatewayMessage>((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())));
      ws.send('not json');
    });

    expect(response.type).toBe('error');
    ws.close();
  });

  it('should track connected clients', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await waitForOpen(ws);
    expect(server.getConnectedClients()).toHaveLength(1);
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(server.getConnectedClients()).toHaveLength(0);
  });
});
