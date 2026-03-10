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
