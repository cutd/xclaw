import { describe, it, expect, vi } from 'vitest';
import { createStreamBridge } from './streamBridge.js';
import type { GatewayMessage } from './types.js';

describe('createStreamBridge', () => {
  it('should send stream_start on first block', () => {
    const sendTo = vi.fn();
    const bridge = createStreamBridge('conn-1', sendTo);

    bridge({ type: 'text', content: 'Hello' });

    expect(sendTo).toHaveBeenCalledTimes(2);
    const startMsg = sendTo.mock.calls[0][1] as GatewayMessage;
    expect(startMsg.type).toBe('chat.stream_start');

    const blockMsg = sendTo.mock.calls[1][1] as GatewayMessage;
    expect(blockMsg.type).toBe('chat.stream_block');
    expect(blockMsg.payload.content).toBe('Hello');
  });

  it('should send stream_block for text chunks', () => {
    const sendTo = vi.fn();
    const bridge = createStreamBridge('conn-1', sendTo);

    bridge({ type: 'text', content: 'Hello' });
    bridge({ type: 'text', content: ' world' });

    // 1 stream_start + 2 stream_blocks
    expect(sendTo).toHaveBeenCalledTimes(3);
  });

  it('should send stream_block for tool_start and tool_result', () => {
    const sendTo = vi.fn();
    const bridge = createStreamBridge('conn-1', sendTo);

    bridge({ type: 'tool_start', toolName: 'shell', toolArgs: { cmd: 'ls' } });
    bridge({ type: 'tool_result', toolName: 'shell', toolResult: 'file.txt' });

    // 1 stream_start + 2 stream_blocks
    expect(sendTo).toHaveBeenCalledTimes(3);
    const toolBlock = sendTo.mock.calls[1][1] as GatewayMessage;
    expect(toolBlock.payload.toolName).toBe('shell');
  });

  it('should send stream_end on done', () => {
    const sendTo = vi.fn();
    const bridge = createStreamBridge('conn-1', sendTo);

    bridge({ type: 'text', content: 'Hi' });
    bridge({ type: 'done' });

    const lastCall = sendTo.mock.calls[sendTo.mock.calls.length - 1][1] as GatewayMessage;
    expect(lastCall.type).toBe('chat.stream_end');
  });

  it('should not send stream_start if first block is done', () => {
    const sendTo = vi.fn();
    const bridge = createStreamBridge('conn-1', sendTo);

    bridge({ type: 'done' });

    expect(sendTo).toHaveBeenCalledTimes(1);
    expect((sendTo.mock.calls[0][1] as GatewayMessage).type).toBe('chat.stream_end');
  });
});
