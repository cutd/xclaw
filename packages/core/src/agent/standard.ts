import type { Agent, AgentContext, AgentResult, StreamCallback, ToolExecution } from './types.js';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
}

interface LLMProviderLike {
  chat(request: {
    model: string;
    messages: ChatMessage[];
    maxTokens?: number;
    systemPrompt?: string;
    tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  }): Promise<{
    content: string;
    model: string;
    usage: { inputTokens: number; outputTokens: number };
    toolCalls?: ToolCall[];
    stopReason?: string;
  }>;
}

export type ToolExecutor = (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

export interface StandardAgentOptions {
  maxToolRounds?: number;
}

export class StandardAgent implements Agent {
  readonly level = 'standard' as const;
  private readonly maxToolRounds: number;

  constructor(
    private readonly provider: LLMProviderLike,
    private readonly toolExecutor: ToolExecutor,
    options?: StandardAgentOptions,
  ) {
    this.maxToolRounds = options?.maxToolRounds ?? 10;
  }

  async run(context: AgentContext, onStream?: StreamCallback): Promise<AgentResult> {
    const messages: ChatMessage[] = [
      ...context.conversationHistory.map((t) => ({
        role: t.role as ChatMessage['role'],
        content: t.content,
      })),
      { role: 'user' as const, content: context.message },
    ];

    const allToolExecutions: ToolExecution[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    let response = await this.provider.chat({
      model: context.model,
      messages,
      maxTokens: context.maxTokens,
      systemPrompt: context.systemPrompt,
      tools: context.tools,
    });

    totalInputTokens += response.usage.inputTokens;
    totalOutputTokens += response.usage.outputTokens;

    for (let round = 0; round < this.maxToolRounds; round++) {
      if (!response.toolCalls || response.toolCalls.length === 0) {
        break;
      }

      // Append assistant message with tool calls indication
      messages.push({ role: 'assistant', content: response.content });

      // Execute each tool call
      for (const toolCall of response.toolCalls) {
        if (onStream) {
          onStream({ type: 'tool_start', toolName: toolCall.name, toolArgs: toolCall.args });
        }

        const startTime = Date.now();
        let result: unknown;
        let error: string | undefined;

        try {
          result = await this.toolExecutor(toolCall.name, toolCall.args);
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          result = `Error: ${error}`;
        }

        const durationMs = Date.now() - startTime;

        allToolExecutions.push({
          toolName: toolCall.name,
          args: toolCall.args,
          result,
          durationMs,
          error,
        });

        if (onStream) {
          onStream({ type: 'tool_result', toolName: toolCall.name, toolResult: result });
        }

        // Feed tool result back as a user message
        messages.push({
          role: 'user',
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }

      // Call LLM again with tool results
      response = await this.provider.chat({
        model: context.model,
        messages,
        maxTokens: context.maxTokens,
        systemPrompt: context.systemPrompt,
        tools: context.tools,
      });

      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;
    }

    if (onStream) {
      onStream({ type: 'text', content: response.content });
      onStream({ type: 'done' });
    }

    return {
      content: response.content,
      model: response.model,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      toolExecutions: allToolExecutions.length > 0 ? allToolExecutions : undefined,
      stopReason: response.stopReason,
    };
  }
}
