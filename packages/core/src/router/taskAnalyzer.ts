export enum TaskTier {
  TRIVIAL = 'trivial',
  SIMPLE = 'simple',
  STANDARD = 'standard',
  COMPLEX = 'complex',
}

export interface TaskAnalysis {
  tier: TaskTier;
  maxInputTokens: number;
  maxOutputTokens: number;
  contextWindowTurns: number;
  confidence: number;
}

const TIER_BUDGETS: Record<TaskTier, Omit<TaskAnalysis, 'tier' | 'confidence'>> = {
  [TaskTier.TRIVIAL]: { maxInputTokens: 500, maxOutputTokens: 200, contextWindowTurns: 2 },
  [TaskTier.SIMPLE]: { maxInputTokens: 2000, maxOutputTokens: 1000, contextWindowTurns: 5 },
  [TaskTier.STANDARD]: { maxInputTokens: 8000, maxOutputTokens: 4000, contextWindowTurns: 10 },
  [TaskTier.COMPLEX]: { maxInputTokens: 32000, maxOutputTokens: 16000, contextWindowTurns: 20 },
};

const GREETING_PATTERNS = /^(hi|hello|hey|你好|嗨|早上好|晚上好|下午好|早安|晚安)(\b|$)/i;
const CODE_KEYWORDS = /代码|code|算法|函数|function|class|接口|api|实现|implement|写[一个]|编写|debug|修复|bug/i;
const COMPLEX_INDICATORS = /架构|设计|系统|完整|详细|方案|分析|优化|重构|微服务|分布式/i;

export class TaskAnalyzer {
  analyze(text: string): TaskAnalysis {
    const tier = this.classifyTier(text);
    const budget = TIER_BUDGETS[tier];
    return { tier, ...budget, confidence: 0.8 };
  }

  private classifyTier(text: string): TaskTier {
    const len = text.length;
    if (len < 20 && GREETING_PATTERNS.test(text.trim())) {
      return TaskTier.TRIVIAL;
    }
    if (len > 80 && COMPLEX_INDICATORS.test(text)) {
      return TaskTier.COMPLEX;
    }
    if (CODE_KEYWORDS.test(text)) {
      return TaskTier.STANDARD;
    }
    if (len < 50) {
      return TaskTier.SIMPLE;
    }
    return TaskTier.SIMPLE;
  }
}
