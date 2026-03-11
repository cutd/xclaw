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

interface StreamChunkLike {
  type: 'text_delta' | 'tool_start' | 'tool_delta' | 'tool_end' | 'done';
  text?: string;
  toolCall?: { name?: string; id?: string };
  usage?: { inputTokens: number; outputTokens: number };
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
  chatStream?(request: {
    model: string;
    messages: ChatMessage[];
    maxTokens?: number;
    systemPrompt?: string;
    tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  }): AsyncIterable<StreamChunkLike>;
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

  private async streamLLMCall(
    request: {
      model: string;
      messages: ChatMessage[];
      maxTokens?: number;
      systemPrompt?: string;
      tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
    },
    onStream: StreamCallback,
  ): Promise<{
    content: string;
    model: string;
    usage: { inputTokens: number; outputTokens: number };
    toolCalls?: ToolCall[];
    stopReason?: string;
  }> {
    let content = '';
    let usage = { inputTokens: 0, outputTokens: 0 };
    const toolCalls: ToolCall[] = [];
    let currentToolName = '';
    let currentToolId = '';
    let currentToolJson = '';

    for await (const chunk of this.provider.chatStream!(request)) {
      switch (chunk.type) {
        case 'text_delta':
          if (chunk.text) {
            content += chunk.text;
            onStream({ type: 'text', content: chunk.text });
          }
          break;
        case 'tool_start':
          currentToolName = chunk.toolCall?.name ?? '';
          currentToolId = chunk.toolCall?.id ?? '';
          currentToolJson = '';
          break;
        case 'tool_delta':
          currentToolJson += chunk.text ?? '';
          break;
        case 'tool_end':
          if (currentToolName) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(currentToolJson); } catch { /* empty */ }
            toolCalls.push({ name: currentToolName, args, id: currentToolId });
            currentToolName = '';
          }
          break;
        case 'done':
          if (chunk.usage) usage = chunk.usage;
          break;
      }
    }

    return {
      content,
      model: request.model,
      usage,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
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

    const useStreaming = !!(this.provider.chatStream && onStream);

    const callLLM = async () => {
      const request = {
        model: context.model,
        messages,
        maxTokens: context.maxTokens,
        systemPrompt: context.systemPrompt,
        tools: context.tools,
      };

      if (useStreaming) {
        return this.streamLLMCall(request, onStream!);
      }
      return this.provider.chat(request);
    };

    let response = await callLLM();
    totalInputTokens += response.usage.inputTokens;
    totalOutputTokens += response.usage.outputTokens;

    for (let round = 0; round < this.maxToolRounds; round++) {
      if (!response.toolCalls || response.toolCalls.length === 0) {
        break;
      }

      messages.push({ role: 'assistant', content: response.content });

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
        allToolExecutions.push({ toolName: toolCall.name, args: toolCall.args, result, durationMs, error });

        if (onStream) {
          onStream({ type: 'tool_result', toolName: toolCall.name, toolResult: result });
        }

        messages.push({
          role: 'user',
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }

      response = await callLLM();
      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;
    }

    if (!useStreaming && onStream) {
      onStream({ type: 'text', content: response.content });
    }
    if (onStream) {
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
