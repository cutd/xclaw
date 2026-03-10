import { describe, it, expect, vi } from 'vitest';
import { MemoryExtractor, type ExtractedMemory } from './extractor.js';
import type { LLMProvider, ChatResponse } from '@xclaw/providers';
import type { MemoryManager } from './manager.js';

function mockProvider(response: string): LLMProvider {
  return {
    name: 'mock',
    models: ['mock-model'],
    chat: vi.fn().mockResolvedValue({
      content: response,
      model: 'mock-model',
      usage: { inputTokens: 100, outputTokens: 50 },
    } satisfies ChatResponse),
    validateApiKey: vi.fn().mockResolvedValue(true),
  };
}

function mockMemoryManager(): MemoryManager {
  return {
    store: vi.fn().mockResolvedValue({ id: 'mem-1', content: '', source: 'conversation', userId: '', tags: [], importance: 0.5, createdAt: 0, updatedAt: 0, accessCount: 0 }),
  } as unknown as MemoryManager;
}

describe('MemoryExtractor', () => {
  it('should extract memories from LLM response', async () => {
    const llmResponse = JSON.stringify([
      { content: 'User prefers TypeScript', category: 'user_preference', importance: 0.8 },
    ]);
    const provider = mockProvider(llmResponse);
    const manager = mockMemoryManager();
    const extractor = new MemoryExtractor({ provider, model: 'mock-model', memoryManager: manager });

    await extractor.process('I prefer TypeScript over JavaScript', 'Sure, TypeScript is great.', 'user_preference', 'user-1', 'sess-1');

    expect(provider.chat).toHaveBeenCalledOnce();
    expect(manager.store).toHaveBeenCalledOnce();
    expect(manager.store).toHaveBeenCalledWith(expect.objectContaining({
      content: 'User prefers TypeScript',
      source: 'conversation',
      userId: 'user-1',
      tags: ['user_preference', 'auto-extracted'],
      importance: 0.8,
    }));
  });

  it('should handle multiple extracted memories', async () => {
    const llmResponse = JSON.stringify([
      { content: 'User name is Dave', category: 'profile_info', importance: 0.9 },
      { content: 'Works at Acme Corp', category: 'profile_info', importance: 0.7 },
    ]);
    const provider = mockProvider(llmResponse);
    const manager = mockMemoryManager();
    const extractor = new MemoryExtractor({ provider, model: 'mock-model', memoryManager: manager });

    await extractor.process('My name is Dave and I work at Acme Corp', 'Nice to meet you, Dave!', 'profile_info', 'user-1');

    expect(manager.store).toHaveBeenCalledTimes(2);
  });

  it('should handle empty extraction result', async () => {
    const provider = mockProvider('[]');
    const manager = mockMemoryManager();
    const extractor = new MemoryExtractor({ provider, model: 'mock-model', memoryManager: manager });

    await extractor.process('How do I sort an array?', 'Use Array.sort().', 'user_preference', 'user-1');

    expect(manager.store).not.toHaveBeenCalled();
  });

  it('should handle malformed LLM response gracefully', async () => {
    const provider = mockProvider('this is not json');
    const manager = mockMemoryManager();
    const extractor = new MemoryExtractor({ provider, model: 'mock-model', memoryManager: manager });

    // Should not throw
    await extractor.process('I prefer tabs', 'Noted.', 'user_preference', 'user-1');

    expect(manager.store).not.toHaveBeenCalled();
  });

  it('should handle LLM call failure gracefully', async () => {
    const provider: LLMProvider = {
      name: 'mock',
      models: ['mock-model'],
      chat: vi.fn().mockRejectedValue(new Error('API error')),
      validateApiKey: vi.fn().mockResolvedValue(true),
    };
    const manager = mockMemoryManager();
    const extractor = new MemoryExtractor({ provider, model: 'mock-model', memoryManager: manager });

    // Should not throw
    await extractor.process('I prefer spaces', 'OK.', 'user_preference', 'user-1');

    expect(manager.store).not.toHaveBeenCalled();
  });
});
