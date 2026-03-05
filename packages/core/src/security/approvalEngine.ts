import type { RiskLevel, RiskAssessment } from '../types/security.js';

const LEVEL_PRIORITY: Record<RiskLevel | 'none', number> = {
  none: -1,
  info: 0,
  notice: 1,
  warning: 2,
  danger: 3,
};

export type PromptLevel = RiskLevel | 'none';

export interface PrompterResult {
  chosenOption: string;
}

export type Prompter = (assessment: RiskAssessment) => Promise<PrompterResult>;

export interface ApprovalEngineOptions {
  promptLevel: PromptLevel;
  trustedOperations?: string[];
  prompter?: Prompter;
}

export interface ApprovalResult {
  approved: boolean;
  autoApproved: boolean;
  chosenOption?: string;
}

export class ApprovalEngine {
  private promptLevel: PromptLevel;
  private trustedOperations: Set<string>;
  private prompter?: Prompter;

  constructor(options: ApprovalEngineOptions) {
    this.promptLevel = options.promptLevel;
    this.trustedOperations = new Set(options.trustedOperations ?? []);
    this.prompter = options.prompter;
  }

  async requestApproval(assessment: RiskAssessment): Promise<ApprovalResult> {
    // If promptLevel is 'none', auto-approve everything
    if (this.promptLevel === 'none') {
      return { approved: true, autoApproved: true, chosenOption: 'proceed' };
    }

    // If the operation is in the trusted list, auto-approve
    if (this.trustedOperations.has(assessment.operation)) {
      return { approved: true, autoApproved: true, chosenOption: 'proceed' };
    }

    // If risk level is below the prompt threshold, auto-approve
    const riskPriority = LEVEL_PRIORITY[assessment.level];
    const thresholdPriority = LEVEL_PRIORITY[this.promptLevel];

    if (riskPriority < thresholdPriority) {
      return { approved: true, autoApproved: true, chosenOption: 'proceed' };
    }

    // Risk level meets or exceeds threshold — need user confirmation
    // If no prompter is provided, auto-approve (can't ask user)
    if (!this.prompter) {
      return { approved: true, autoApproved: true, chosenOption: 'proceed' };
    }

    // Delegate to prompter
    const response = await this.prompter(assessment);
    const approved = response.chosenOption !== 'cancel';

    return {
      approved,
      autoApproved: false,
      chosenOption: response.chosenOption,
    };
  }
}
