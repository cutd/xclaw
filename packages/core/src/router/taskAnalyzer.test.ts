import { describe, it, expect } from 'vitest';
import { TaskAnalyzer, TaskTier } from './taskAnalyzer.js';

describe('TaskAnalyzer', () => {
  const analyzer = new TaskAnalyzer();

  it('should classify greetings as TRIVIAL', () => {
    expect(analyzer.analyze('你好').tier).toBe(TaskTier.TRIVIAL);
    expect(analyzer.analyze('Hello').tier).toBe(TaskTier.TRIVIAL);
    expect(analyzer.analyze('hi').tier).toBe(TaskTier.TRIVIAL);
  });

  it('should classify simple questions as SIMPLE', () => {
    expect(analyzer.analyze('今天天气怎么样?').tier).toBe(TaskTier.SIMPLE);
    expect(analyzer.analyze('翻译一下 hello world').tier).toBe(TaskTier.SIMPLE);
  });

  it('should classify code requests as STANDARD', () => {
    const result = analyzer.analyze('帮我写一个排序算法');
    expect(result.tier).toBe(TaskTier.STANDARD);
  });

  it('should classify long complex requests as COMPLEX', () => {
    const longMsg = '请帮我设计一个完整的微服务架构，包含用户认证、订单管理、' +
      '支付系统、库存管理四个服务，需要考虑服务间通信、数据一致性、' +
      '故障恢复、监控告警等方面。每个服务需要详细的 API 设计和数据库 schema。';
    expect(analyzer.analyze(longMsg).tier).toBe(TaskTier.COMPLEX);
  });

  it('should return token budget for each tier', () => {
    const result = analyzer.analyze('hi');
    expect(result.maxInputTokens).toBeGreaterThan(0);
    expect(result.maxOutputTokens).toBeGreaterThan(0);
  });
});
