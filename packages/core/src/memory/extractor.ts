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
