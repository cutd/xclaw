# Phase 4: Memory Auto-Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automatic memory extraction to xclaw — heuristics flag candidate messages, a lightweight LLM call extracts structured memories, stored async via the existing MemoryManager.

**Architecture:** A `MemoryHeuristic` class scans user messages with regex patterns for four categories (preference, profile, decision, factual). When triggered, a `MemoryExtractor` calls a lightweight LLM to extract structured JSON memories, then stores them via `MemoryManager.store()`. The extractor integrates into `MessagePipeline` as a fire-and-forget post-processing step.

**Tech Stack:** TypeScript 5.x, Vitest, existing `LLMProvider` interface from `@xclaw/providers`

---

## Plan Overview

```
Task 1:  MemoryHeuristic — regex pattern scanner with category detection
Task 2:  MemoryExtractor — LLM-based structured memory extraction
Task 3:  Pipeline integration — async fire-and-forget extraction in MessagePipeline
Task 4:  Integration tests — full flow from heuristic through extraction to storage
```

---

### Task 1: MemoryHeuristic

**Files:**
- Create: `packages/core/src/memory/heuristic.ts`
- Create: `packages/core/src/memory/heuristic.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/memory/heuristic.test.ts
import { describe, it, expect } from 'vitest';
import { MemoryHeuristic, type HeuristicResult } from './heuristic.js';

describe('MemoryHeuristic', () => {
  const heuristic = new MemoryHeuristic();

  describe('user_preference', () => {
    it('should detect "I prefer" statements', () => {
      const result = heuristic.scan('I prefer TypeScript over JavaScript');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('user_preference');
    });

    it('should detect "always use" statements', () => {
      const result = heuristic.scan('Always use dark mode in editors');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('user_preference');
    });

    it('should detect "I like" statements', () => {
      const result = heuristic.scan('I like concise answers');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('user_preference');
    });
  });

  describe('profile_info', () => {
    it('should detect "my name is" statements', () => {
      const result = heuristic.scan('My name is Dave');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('profile_info');
    });

    it('should detect "I work at" statements', () => {
      const result = heuristic.scan('I work at Acme Corp');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('profile_info');
    });
  });

  describe('decision', () => {
    it('should detect "we decided" statements', () => {
      const result = heuristic.scan('We decided to use PostgreSQL');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('decision');
    });

    it('should detect "let\'s go with" statements', () => {
      const result = heuristic.scan("Let's go with the REST approach");
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('decision');
    });
  });

  describe('factual_knowledge', () => {
    it('should detect "project uses" statements', () => {
      const result = heuristic.scan('The project uses pnpm for package management');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('factual_knowledge');
    });

    it('should detect "endpoint is" statements', () => {
      const result = heuristic.scan('The API endpoint is /v2/users');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('factual_knowledge');
    });
  });

  describe('no match', () => {
    it('should not trigger on unrelated text', () => {
      const result = heuristic.scan('How do I sort an array in JavaScript?');
      expect(result.triggered).toBe(false);
    });

    it('should not trigger on empty text', () => {
      const result = heuristic.scan('');
      expect(result.triggered).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('should match regardless of case', () => {
      const result = heuristic.scan('MY NAME IS Dave');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('profile_info');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run packages/core/src/memory/heuristic.test.ts`
Expected: FAIL — module not found

**Step 3: Implement MemoryHeuristic**

```typescript
// packages/core/src/memory/heuristic.ts
export type MemoryCategory = 'user_preference' | 'profile_info' | 'decision' | 'factual_knowledge';

export interface HeuristicResult {
  triggered: boolean;
  category?: MemoryCategory;
}

interface PatternRule {
  category: MemoryCategory;
  patterns: RegExp[];
}

const RULES: PatternRule[] = [
  {
    category: 'user_preference',
    patterns: [
      /\bi prefer\b/i,
      /\bi like\b/i,
      /\bi hate\b/i,
      /\balways use\b/i,
      /\bnever use\b/i,
      /\bi want\b/i,
      /\bdon'?t like\b/i,
    ],
  },
  {
    category: 'profile_info',
    patterns: [
      /\bmy name is\b/i,
      /\bi work at\b/i,
      /\bi'?m a\b/i,
      /\bi am a\b/i,
      /\bmy timezone\b/i,
      /\bi live in\b/i,
      /\bmy email\b/i,
    ],
  },
  {
    category: 'decision',
    patterns: [
      /\bwe decided\b/i,
      /\blet'?s go with\b/i,
      /\bi chose\b/i,
      /\bswitched to\b/i,
      /\bwe agreed\b/i,
      /\bgoing with\b/i,
    ],
  },
  {
    category: 'factual_knowledge',
    patterns: [
      /\bthe api is\b/i,
      /\bendpoint is\b/i,
      /\bpassword is in\b/i,
      /\bproject uses\b/i,
      /\bdeploy to\b/i,
      /\bconfig is\b/i,
      /\bstored in\b/i,
    ],
  },
];

export class MemoryHeuristic {
  scan(text: string): HeuristicResult {
    if (!text) return { triggered: false };

    for (const rule of RULES) {
      for (const pattern of rule.patterns) {
        if (pattern.test(text)) {
          return { triggered: true, category: rule.category };
        }
      }
    }

    return { triggered: false };
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run packages/core/src/memory/heuristic.test.ts`
Expected: PASS — all 11 tests

**Step 5: Run full test suite**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add packages/core/src/memory/heuristic.ts packages/core/src/memory/heuristic.test.ts
git commit -m "feat(memory): add MemoryHeuristic — regex pattern scanner for memory extraction triggers"
```

---

### Task 2: MemoryExtractor

**Files:**
- Create: `packages/core/src/memory/extractor.ts`
- Create: `packages/core/src/memory/extractor.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/core/src/memory/extractor.test.ts
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
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run packages/core/src/memory/extractor.test.ts`
Expected: FAIL — module not found

**Step 3: Implement MemoryExtractor**

```typescript
// packages/core/src/memory/extractor.ts
import type { LLMProvider } from '@xclaw/providers';
import type { MemoryManager } from './manager.js';
import type { MemoryCategory } from './heuristic.js';

export interface ExtractedMemory {
  content: string;
  category: string;
  importance: number;
}

export interface MemoryExtractorConfig {
  provider: LLMProvider;
  model: string;
  memoryManager: MemoryManager;
}

const EXTRACTION_PROMPT = `Extract any worth-remembering information from this conversation exchange.
Categories: user_preference, profile_info, decision, factual_knowledge

Return a JSON array of extracted memories:
[{"content": "...", "category": "...", "importance": 0.0-1.0}]

If nothing is worth remembering, return [].`;

export class MemoryExtractor {
  private readonly config: MemoryExtractorConfig;

  constructor(config: MemoryExtractorConfig) {
    this.config = config;
  }

  async process(
    userMessage: string,
    assistantResponse: string,
    categoryHint: MemoryCategory,
    userId: string,
    sessionId?: string,
  ): Promise<void> {
    try {
      const response = await this.config.provider.chat({
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: `${EXTRACTION_PROMPT}\n\nCategory hint: ${categoryHint}\n\nUser: ${userMessage}\nAssistant: ${assistantResponse}`,
          },
        ],
        maxTokens: 512,
        temperature: 0,
      });

      const memories = this.parseExtraction(response.content);

      for (const mem of memories) {
        await this.config.memoryManager.store({
          content: mem.content,
          source: 'conversation',
          userId,
          sessionId,
          tags: [mem.category, 'auto-extracted'],
          importance: mem.importance,
        });
      }
    } catch {
      // Best-effort: silently drop extraction failures
    }
  }

  private parseExtraction(raw: string): ExtractedMemory[] {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (item: unknown): item is ExtractedMemory =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as ExtractedMemory).content === 'string' &&
          typeof (item as ExtractedMemory).category === 'string' &&
          typeof (item as ExtractedMemory).importance === 'number',
      );
    } catch {
      return [];
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run packages/core/src/memory/extractor.test.ts`
Expected: PASS — all 5 tests

**Step 5: Run full test suite**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add packages/core/src/memory/extractor.ts packages/core/src/memory/extractor.test.ts
git commit -m "feat(memory): add MemoryExtractor — LLM-based structured memory extraction"
```

---

### Task 3: Pipeline Integration

**Files:**
- Modify: `packages/core/src/gateway/pipeline.ts`
- Modify: `packages/core/src/memory/index.ts` (add exports)
- Modify: `packages/core/src/gateway/pipeline.test.ts` (add extraction test)

**Step 1: Write the failing test**

Add a new test case to the existing `packages/core/src/gateway/pipeline.test.ts`:

```typescript
// Add this test to the existing describe block:

it('should fire-and-forget memory extraction when extractor is configured', async () => {
  const extractorProcess = vi.fn().mockResolvedValue(undefined);
  const mockExtractor = { process: extractorProcess };

  const pipeline = new MessagePipeline({
    ...baseConfig,
    memoryExtractor: mockExtractor as any,
  });

  const result = await pipeline.process(testMessage);

  // Result should return without waiting for extraction
  expect(result.content).toBeDefined();

  // Give the fire-and-forget a tick to execute
  await new Promise((r) => setTimeout(r, 10));

  // Extractor should have been called with the user message and response
  expect(extractorProcess).toHaveBeenCalledOnce();
  expect(extractorProcess).toHaveBeenCalledWith(
    expect.any(String),   // userMessage
    expect.any(String),   // assistantResponse
    expect.any(String),   // category
    expect.any(String),   // userId
    expect.any(String),   // sessionId
  );
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run packages/core/src/gateway/pipeline.test.ts`
Expected: FAIL — `memoryExtractor` not in config type

**Step 3: Update pipeline.ts**

Add to imports in `packages/core/src/gateway/pipeline.ts`:

```typescript
import type { MemoryExtractor } from '../memory/extractor.js';
import { MemoryHeuristic } from '../memory/heuristic.js';
```

Add to `MessagePipelineConfig`:

```typescript
memoryExtractor?: MemoryExtractor;
```

Add after the existing `6b. Memory: store daily log` block (around line 100), before the `// 7. Audit` comment:

```typescript
    // 6c. Memory: auto-extract (fire-and-forget)
    if (this.config.memoryExtractor) {
      const heuristic = new MemoryHeuristic();
      const scan = heuristic.scan(text);
      if (scan.triggered && scan.category) {
        this.config.memoryExtractor
          .process(text, result.content, scan.category, msg.source.userId, msg.source.sessionId)
          .catch(() => {});
      }
    }
```

**Step 4: Update memory/index.ts exports**

Add to `packages/core/src/memory/index.ts`:

```typescript
export { MemoryHeuristic } from './heuristic.js';
export type { HeuristicResult, MemoryCategory } from './heuristic.js';
export { MemoryExtractor } from './extractor.js';
export type { ExtractedMemory, MemoryExtractorConfig } from './extractor.js';
```

**Step 5: Run test to verify it passes**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run packages/core/src/gateway/pipeline.test.ts`
Expected: PASS

**Step 6: Run full test suite**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add packages/core/src/gateway/pipeline.ts packages/core/src/memory/index.ts packages/core/src/gateway/pipeline.test.ts
git commit -m "feat(memory): integrate auto-extraction into MessagePipeline — async fire-and-forget"
```

---

### Task 4: Integration Tests

**Files:**
- Create: `packages/core/src/memory/extraction-integration.test.ts`

**Step 1: Write integration test**

```typescript
// packages/core/src/memory/extraction-integration.test.ts
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
```

**Step 2: Run integration test**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run packages/core/src/memory/extraction-integration.test.ts`
Expected: PASS — all 4 tests

**Step 3: Run full test suite**

Run: `cd /Users/dateng/cutd_data/dev/xclaw && npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add packages/core/src/memory/extraction-integration.test.ts
git commit -m "test(memory): add memory auto-extraction integration tests"
```

---

## Summary

After completing all 4 tasks, Phase 4 Memory Auto-Extraction delivers:

- **MemoryHeuristic**: Regex pattern scanner detecting 4 categories of extractable information
- **MemoryExtractor**: LLM-based structured extraction with graceful error handling
- **Pipeline integration**: Async fire-and-forget extraction in MessagePipeline
- **Tests**: Unit tests for heuristic (11), extractor (5), pipeline (1), integration (4) = 21 new tests
