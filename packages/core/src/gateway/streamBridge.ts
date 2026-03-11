import { randomUUID } from 'node:crypto';
import type { StreamBlock, StreamCallback } from '../agent/types.js';
import type { GatewayMessage } from './types.js';

export type SendToFn = (connectionId: string, message: GatewayMessage) => void;

export function createStreamBridge(
  connectionId: string,
  sendTo: SendToFn,
): StreamCallback {
  let started = false;

  return (block: StreamBlock) => {
    // Send stream_start before the first non-done block
    if (!started && block.type !== 'done') {
      sendTo(connectionId, {
        type: 'chat.stream_start',
        id: randomUUID(),
        payload: {},
        timestamp: Date.now(),
      });
      started = true;
    }

    if (block.type === 'done') {
      sendTo(connectionId, {
        type: 'chat.stream_end',
        id: randomUUID(),
        payload: {},
        timestamp: Date.now(),
      });
      return;
    }

    const payload: Record<string, unknown> = {};
    if (block.content !== undefined) payload.content = block.content;
    if (block.toolName !== undefined) payload.toolName = block.toolName;
    if (block.toolArgs !== undefined) payload.toolArgs = block.toolArgs;
    if (block.toolResult !== undefined) payload.toolResult = block.toolResult;
    payload.blockType = block.type;

    sendTo(connectionId, {
      type: 'chat.stream_block',
      id: randomUUID(),
      payload,
      timestamp: Date.now(),
    });
  };
}
