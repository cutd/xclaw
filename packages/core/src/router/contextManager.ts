interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  importance?: number;
}

export class ContextManager {
  private turns: Map<string, ConversationTurn[]> = new Map();

  addTurn(sessionId: string, turn: ConversationTurn): void {
    if (!this.turns.has(sessionId)) {
      this.turns.set(sessionId, []);
    }
    this.turns.get(sessionId)!.push(turn);
  }

  getContext(sessionId: string, maxTurns: number): ConversationTurn[] {
    const turns = this.turns.get(sessionId) ?? [];
    if (turns.length <= maxTurns) return turns;
    return turns.slice(-maxTurns);
  }

  clearSession(sessionId: string): void {
    this.turns.delete(sessionId);
  }
}
