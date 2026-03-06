import type { Agent, AgentContext, AgentResult, AgentTier, StreamCallback, ToolExecution } from './types.js';
import type { ToolExecutor } from './standard.js';

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

export interface ExpertAgentOptions {
  maxToolRounds?: number;
  subAgentFactory?: (tier: AgentTier) => Agent;
}

const DELEGATE_TOOL = {
  name: '__delegate',
  description: 'Delegate a subtask to a lighter agent. Provide the subtask description and the tier of agent to use.',
  inputSchema: {
    type: 'object',
    properties: {
      subtask: { type: 'string', description: 'The subtask to delegate' },
      tier: { type: 'string', enum: ['lightweight', 'standard'], description: 'The tier of agent to delegate to' },
    },
    required: ['subtask', 'tier'],
  } as Record<string, unknown>,
};

export class ExpertAgent implements Agent {
  readonly level = 'expert' as const;
  private readonly maxToolRounds: number;
  private readonly subAgentFactory?: (tier: AgentTier) => Agent;

  constructor(
    private readonly provider: LLMProviderLike,
    private readonly toolExecutor: ToolExecutor,
    options?: ExpertAgentOptions,
  ) {
    this.maxToolRounds = options?.maxToolRounds ?? 20;
    this.subAgentFactory = options?.subAgentFactory;
  }

  async run(context: AgentContext, onStream?: StreamCallback): Promise<AgentResult> {
    const messages: ChatMessage[] = [
      ...context.conversationHistory.map((t) => ({
        role: t.role as ChatMessage['role'],
        content: t.content,
      })),
      { role: 'user' as const, content: context.message },
    ];

    // Inject __delegate tool if subAgentFactory is provided
    const tools = this.subAgentFactory
      ? [...context.tools, DELEGATE_TOOL]
      : [...context.tools];

    const allToolExecutions: ToolExecution[] = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    let response = await this.provider.chat({
      model: context.model,
      messages,
      maxTokens: context.maxTokens,
      systemPrompt: context.systemPrompt,
      tools,
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
          if (toolCall.name === '__delegate' && this.subAgentFactory) {
            result = await this.handleDelegation(
              toolCall.args as { subtask: string; tier: AgentTier },
              context,
              { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
              (usage) => {
                totalInputTokens = usage.inputTokens;
                totalOutputTokens = usage.outputTokens;
              },
            );
          } else {
            result = await this.toolExecutor(toolCall.name, toolCall.args);
          }
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
        tools,
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

  private async handleDelegation(
    args: { subtask: string; tier: AgentTier },
    parentContext: AgentContext,
    currentUsage: { inputTokens: number; outputTokens: number },
    updateUsage: (usage: { inputTokens: number; outputTokens: number }) => void,
  ): Promise<string> {
    const subAgent = this.subAgentFactory!(args.tier);

    const subContext: AgentContext = {
      sessionId: parentContext.sessionId,
      userId: parentContext.userId,
      message: args.subtask,
      tier: args.tier,
      model: parentContext.model,
      maxTokens: parentContext.maxTokens,
      conversationHistory: [],
      tools: [],
    };

    const subResult = await subAgent.run(subContext);

    // Accumulate sub-agent token usage into parent totals
    updateUsage({
      inputTokens: currentUsage.inputTokens + subResult.usage.inputTokens,
      outputTokens: currentUsage.outputTokens + subResult.usage.outputTokens,
    });

    return subResult.content;
  }
}
