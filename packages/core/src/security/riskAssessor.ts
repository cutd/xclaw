import type { RiskLevel, RiskAssessment, RiskMitigation } from '../types/security.js';

export interface AssessmentInput {
  operation: string;
  target?: string;
  command?: string;
  unsigned?: boolean;
  [key: string]: unknown;
}

interface RiskRule {
  match: (input: AssessmentInput) => boolean;
  level: RiskLevel;
  description: (input: AssessmentInput) => string;
  mitigations?: RiskMitigation[];
}

const DEFAULT_RULES: RiskRule[] = [
  // Highest risk first — ordered by priority
  {
    match: (input) => input.operation === 'skill.install' && input.unsigned === true,
    level: 'danger',
    description: () => 'Install unsigned skill — code has not been verified',
    mitigations: [
      {
        label: 'Sandbox',
        description: 'Run the skill in an isolated sandbox environment',
        action: 'sandbox',
      },
    ],
  },
  {
    match: (input) => input.operation === 'file.delete',
    level: 'warning',
    description: (input) => `Delete file: ${input.target ?? 'unknown target'}`,
  },
  {
    match: (input) => input.operation === 'system.exec',
    level: 'warning',
    description: (input) => `Execute system command: ${input.command ?? 'unknown command'}`,
    mitigations: [
      {
        label: 'Sandbox',
        description: 'Run command in a sandboxed environment',
        action: 'sandbox',
      },
    ],
  },
  {
    match: (input) =>
      input.operation === 'file.write' && typeof input.target === 'string' && !input.target.startsWith('/tmp'),
    level: 'notice',
    description: (input) => `Write file outside /tmp: ${input.target ?? 'unknown target'}`,
    mitigations: [
      {
        label: 'Restrict filesystem',
        description: 'Limit writes to a designated workspace directory',
        action: 'restrict_fs',
      },
    ],
  },
  {
    match: (input) => input.operation === 'network.outbound',
    level: 'notice',
    description: (input) => `Outbound network request to ${input.target ?? 'unknown host'}`,
    mitigations: [
      {
        label: 'Restrict network',
        description: 'Allow only whitelisted destinations',
        action: 'restrict_network',
      },
    ],
  },
];

export class RiskAssessor {
  private rules: RiskRule[];

  constructor(customRules?: RiskRule[]) {
    this.rules = customRules ?? DEFAULT_RULES;
  }

  assess(input: AssessmentInput): RiskAssessment {
    for (const rule of this.rules) {
      if (rule.match(input)) {
        return {
          level: rule.level,
          operation: input.operation,
          description: rule.description(input),
          mitigations: rule.mitigations,
        };
      }
    }

    // Default: info level — no risk detected
    return {
      level: 'info',
      operation: input.operation,
      description: `Operation: ${input.operation}`,
    };
  }
}
