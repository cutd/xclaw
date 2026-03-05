export type RiskLevel = 'info' | 'notice' | 'warning' | 'danger';

export interface RiskAssessment {
  level: RiskLevel;
  operation: string;
  description: string;
  details?: string[];
  mitigations?: RiskMitigation[];
}

export interface RiskMitigation {
  label: string;
  description: string;
  action: 'sandbox' | 'restrict_network' | 'restrict_fs' | 'none';
}

export interface ApprovalRequest {
  id: string;
  assessment: RiskAssessment;
  options: ApprovalOption[];
  timeoutMs: number;
  createdAt: number;
}

export interface ApprovalOption {
  key: string;
  label: string;
  description: string;
  mitigations?: RiskMitigation[];
}

export type ApprovalResponse = {
  requestId: string;
  chosenOption: string;
  timestamp: number;
};

export type SecretLevel = 'low' | 'medium' | 'high';

export interface AuditEntry {
  id: string;
  timestamp: number;
  operation: string;
  riskLevel: RiskLevel;
  userId: string;
  sessionId: string;
  approved: boolean;
  details?: Record<string, unknown>;
}
