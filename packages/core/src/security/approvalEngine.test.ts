import { describe, it, expect, vi } from 'vitest';
import { ApprovalEngine } from './approvalEngine.js';
import type { RiskAssessment } from '../types/security.js';

describe('ApprovalEngine', () => {
  it('should auto-approve INFO level operations', async () => {
    const engine = new ApprovalEngine({ promptLevel: 'warning' });
    const assessment: RiskAssessment = { level: 'info', operation: 'file.read', description: 'Read a file' };
    const result = await engine.requestApproval(assessment);
    expect(result.approved).toBe(true);
    expect(result.autoApproved).toBe(true);
  });

  it('should auto-approve NOTICE when promptLevel is WARNING', async () => {
    const engine = new ApprovalEngine({ promptLevel: 'warning' });
    const assessment: RiskAssessment = { level: 'notice', operation: 'network.outbound', description: 'Access external network' };
    const result = await engine.requestApproval(assessment);
    expect(result.approved).toBe(true);
    expect(result.autoApproved).toBe(true);
  });

  it('should delegate to prompter for WARNING when promptLevel is WARNING', async () => {
    const prompter = vi.fn().mockResolvedValue({ chosenOption: 'proceed' });
    const engine = new ApprovalEngine({ promptLevel: 'warning', prompter });
    const assessment: RiskAssessment = { level: 'warning', operation: 'file.delete', description: 'Delete file' };
    const result = await engine.requestApproval(assessment);
    expect(prompter).toHaveBeenCalled();
    expect(result.approved).toBe(true);
  });

  it('should auto-approve everything when promptLevel is NONE', async () => {
    const engine = new ApprovalEngine({ promptLevel: 'none' });
    const assessment: RiskAssessment = { level: 'danger', operation: 'skill.install', description: 'Install unsigned skill' };
    const result = await engine.requestApproval(assessment);
    expect(result.approved).toBe(true);
    expect(result.autoApproved).toBe(true);
  });

  it('should respect trusted operations list', async () => {
    const engine = new ApprovalEngine({ promptLevel: 'warning', trustedOperations: ['file.delete'] });
    const assessment: RiskAssessment = { level: 'warning', operation: 'file.delete', description: 'Delete file' };
    const result = await engine.requestApproval(assessment);
    expect(result.approved).toBe(true);
    expect(result.autoApproved).toBe(true);
  });

  it('should handle user cancellation', async () => {
    const prompter = vi.fn().mockResolvedValue({ chosenOption: 'cancel' });
    const engine = new ApprovalEngine({ promptLevel: 'warning', prompter });
    const assessment: RiskAssessment = { level: 'warning', operation: 'file.delete', description: 'Delete file' };
    const result = await engine.requestApproval(assessment);
    expect(result.approved).toBe(false);
  });
});
