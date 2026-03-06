export type AgentTier = 'lightweight' | 'standard' | 'expert';

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentContext {
  sessionId: string;
  userId: string;
  message: string;
  tier: string;
  model: string;
  maxTokens: number;
  conversationHistory: ConversationTurn[];
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  systemPrompt?: string;
}

export interface ToolExecution {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  error?: string;
}

export interface AgentResult {
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  toolExecutions?: ToolExecution[];
  stopReason?: string;
}

export type StreamCallback = (block: StreamBlock) => void;

export interface StreamBlock {
  type: 'text' | 'tool_start' | 'tool_result' | 'done';
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
}

export interface Agent {
  readonly level: AgentTier;
  run(context: AgentContext, onStream?: StreamCallback): Promise<AgentResult>;
}
