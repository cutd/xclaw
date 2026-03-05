import { describe, it, expect } from 'vitest';
import { ModelRouter } from './modelRouter.js';
import { TaskTier } from './taskAnalyzer.js';

describe('ModelRouter', () => {
  const router = new ModelRouter({
    tierModels: {
      [TaskTier.TRIVIAL]: 'claude-haiku',
      [TaskTier.SIMPLE]: 'claude-sonnet',
      [TaskTier.STANDARD]: 'claude-sonnet',
      [TaskTier.COMPLEX]: 'claude-opus',
    },
    defaultModel: 'claude-sonnet',
  });

  it('should route TRIVIAL tasks to small model', () => {
    expect(router.selectModel(TaskTier.TRIVIAL)).toBe('claude-haiku');
  });

  it('should route COMPLEX tasks to large model', () => {
    expect(router.selectModel(TaskTier.COMPLEX)).toBe('claude-opus');
  });

  it('should fall back to default model for unknown tier', () => {
    expect(router.selectModel('unknown' as TaskTier)).toBe('claude-sonnet');
  });
});
