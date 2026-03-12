import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConfigWatcher } from './watcher.js';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';

vi.mock('node:fs', () => ({
  watch: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('yaml', () => ({
  parse: vi.fn((str: string) => JSON.parse(str)),
}));

describe('ConfigWatcher', () => {
  let mockWatchCallback: ((eventType: string, filename: string) => void) | undefined;
  const mockClose = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fs.watch).mockImplementation((_path: any, _opts: any, cb?: any) => {
      mockWatchCallback = cb ?? _opts;
      return { close: mockClose } as any;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mockWatchCallback = undefined;
  });

  it('should call onChange when file changes (after debounce)', async () => {
    const onChange = vi.fn();
    const newConfig = { version: '0.2.0', gateway: { port: 9999 } };
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(newConfig) as any);

    const watcher = new ConfigWatcher('/path/to/config.yaml', onChange, 100);
    watcher.start();

    mockWatchCallback!('change', 'config.yaml');

    expect(onChange).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(150);

    expect(onChange).toHaveBeenCalledWith(newConfig);
  });

  it('should debounce rapid changes', async () => {
    const onChange = vi.fn();
    const config = { version: '0.2.0' };
    vi.mocked(fsPromises.readFile).mockResolvedValue(JSON.stringify(config) as any);

    const watcher = new ConfigWatcher('/path/to/config.yaml', onChange, 200);
    watcher.start();

    mockWatchCallback!('change', 'config.yaml');
    await vi.advanceTimersByTimeAsync(50);
    mockWatchCallback!('change', 'config.yaml');
    await vi.advanceTimersByTimeAsync(50);
    mockWatchCallback!('change', 'config.yaml');

    await vi.advanceTimersByTimeAsync(250);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('should not crash on invalid config', async () => {
    const onChange = vi.fn();
    vi.mocked(fsPromises.readFile).mockResolvedValue('not valid json or yaml' as any);
    const { parse } = await import('yaml');
    vi.mocked(parse).mockImplementation(() => { throw new Error('Parse error'); });

    const watcher = new ConfigWatcher('/path/to/config.yaml', onChange, 100);
    watcher.start();

    mockWatchCallback!('change', 'config.yaml');
    await vi.advanceTimersByTimeAsync(150);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('should not crash on file read error', async () => {
    const onChange = vi.fn();
    vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));

    const watcher = new ConfigWatcher('/path/to/config.yaml', onChange, 100);
    watcher.start();

    mockWatchCallback!('change', 'config.yaml');
    await vi.advanceTimersByTimeAsync(150);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('should stop watching on stop()', () => {
    const onChange = vi.fn();
    const watcher = new ConfigWatcher('/path/to/config.yaml', onChange, 100);
    watcher.start();
    watcher.stop();

    expect(mockClose).toHaveBeenCalled();
  });
});
