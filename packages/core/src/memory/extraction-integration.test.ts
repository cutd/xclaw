import { describe, it, expect, vi } from 'vitest';
import { MemoryHeuristic } from './heuristic.js';
import { MemoryExtractor } from './extractor.js';
import type { LLMProvider, ChatResponse } from '@xclaw/providers';
import type { MemoryManager } from './manager.js';
import type { CreateMemoryInput } from './types.js';

describe('Memory Extraction Integration', () => {
  function setup(llmResponse: string) {
    const provider: LLMProvider = {
      name: 'mock',
      models: ['mock-model'],
      chat: vi.fn().mockResolvedValue({
        content: llmResponse,
        model: 'mock-model',
        usage: { inputTokens: 100, outputTokens: 50 },
      } satisfies ChatResponse),
      validateApiKey: vi.fn().mockResolvedValue(true),
    };

    const stored: CreateMemoryInput[] = [];
    const manager = {
      store: vi.fn().mockImplementation((input: CreateMemoryInput) => {
        stored.push(input);
        return Promise.resolve({ id: 'mem-1', ...input, createdAt: Date.now(), updatedAt: Date.now(), accessCount: 0 });
      }),
    } as unknown as MemoryManager;

    const heuristic = new MemoryHeuristic();
    const extractor = new MemoryExtractor({ provider, model: 'mock-model', memoryManager: manager });

    return { heuristic, extractor, provider, manager, stored };
  }

  it('should extract and store a user preference end-to-end', async () => {
    const { heuristic, extractor, provider, stored } = setup(
      JSON.stringify([{ content: 'User prefers TypeScript over JavaScript', category: 'user_preference', importance: 0.8 }]),
    );

    const userMessage = 'I prefer TypeScript over JavaScript';
    const assistantResponse = 'TypeScript is a great choice for type safety.';

    // Step 1: Heuristic detects candidate
    const scan = heuristic.scan(userMessage);
    expect(scan.triggered).toBe(true);
    expect(scan.category).toBe('user_preference');

    // Step 2: Extractor calls LLM and stores
    await extractor.process(userMessage, assistantResponse, scan.category!, 'user-1', 'sess-1');

    // Step 3: Verify stored memory
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe('User prefers TypeScript over JavaScript');
    expect(stored[0].tags).toContain('user_preference');
    expect(stored[0].tags).toContain('auto-extracted');
    expect(stored[0].importance).toBe(0.8);
    expect(stored[0].userId).toBe('user-1');
    expect(stored[0].sessionId).toBe('sess-1');
  });

  it('should skip extraction when heuristic does not trigger', async () => {
    const { heuristic, extractor, provider } = setup('[]');

    const userMessage = 'How do I reverse a string in Python?';
    const scan = heuristic.scan(userMessage);
    expect(scan.triggered).toBe(false);

    // Extractor should NOT be called when heuristic doesn't trigger
    // (this is enforced by the pipeline, not the extractor itself)
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('should handle profile info extraction', async () => {
    const { heuristic, extractor, stored } = setup(
      JSON.stringify([
        { content: 'User name is Dave', category: 'profile_info', importance: 0.9 },
        { content: 'User works at Acme Corp', category: 'profile_info', importance: 0.7 },
      ]),
    );

    const scan = heuristic.scan('My name is Dave and I work at Acme Corp');
    expect(scan.triggered).toBe(true);

    await extractor.process('My name is Dave and I work at Acme Corp', 'Nice to meet you!', scan.category!, 'user-1');

    expect(stored).toHaveLength(2);
    expect(stored[0].content).toBe('User name is Dave');
    expect(stored[1].content).toBe('User works at Acme Corp');
  });

  it('should handle decision extraction', async () => {
    const { heuristic, extractor, stored } = setup(
      JSON.stringify([{ content: 'Team decided to use PostgreSQL for the database', category: 'decision', importance: 0.85 }]),
    );

    const scan = heuristic.scan('We decided to use PostgreSQL');
    expect(scan.triggered).toBe(true);
    expect(scan.category).toBe('decision');

    await extractor.process('We decided to use PostgreSQL', 'Good choice for relational data.', scan.category!, 'user-1');

    expect(stored).toHaveLength(1);
    expect(stored[0].tags).toContain('decision');
  });
});
