import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from './base.js';
import type { LLMProvider, ChatRequest, ChatResponse } from './base.js';

describe('ProviderRegistry', () => {
  const mockProvider: LLMProvider = {
    name: 'mock',
    models: ['mock-small', 'mock-large'],
    async chat(request: ChatRequest): Promise<ChatResponse> {
      return {
        content: `Echo: ${request.messages[request.messages.length - 1].content}`,
        model: request.model,
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
    async validateApiKey(): Promise<boolean> {
      return true;
    },
  };

  it('should register and retrieve a provider', () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider);
    expect(registry.get('mock')).toBe(mockProvider);
  });

  it('should resolve model to provider', () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider);
    expect(registry.resolveModel('mock-small')).toBe(mockProvider);
  });

  it('should return undefined for unknown model', () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider);
    expect(registry.resolveModel('unknown-model')).toBeUndefined();
  });

  it('should call provider chat', async () => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider);
    const provider = registry.resolveModel('mock-small')!;
    const response = await provider.chat({
      model: 'mock-small',
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(response.content).toBe('Echo: test');
    expect(response.usage.inputTokens).toBe(10);
  });
});
