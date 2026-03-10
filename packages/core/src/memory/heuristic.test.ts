import { describe, it, expect } from 'vitest';
import { MemoryHeuristic, type HeuristicResult } from './heuristic.js';

describe('MemoryHeuristic', () => {
  const heuristic = new MemoryHeuristic();

  describe('user_preference', () => {
    it('should detect "I prefer" statements', () => {
      const result = heuristic.scan('I prefer TypeScript over JavaScript');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('user_preference');
    });

    it('should detect "always use" statements', () => {
      const result = heuristic.scan('Always use dark mode in editors');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('user_preference');
    });

    it('should detect "I like" statements', () => {
      const result = heuristic.scan('I like concise answers');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('user_preference');
    });
  });

  describe('profile_info', () => {
    it('should detect "my name is" statements', () => {
      const result = heuristic.scan('My name is Dave');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('profile_info');
    });

    it('should detect "I work at" statements', () => {
      const result = heuristic.scan('I work at Acme Corp');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('profile_info');
    });
  });

  describe('decision', () => {
    it('should detect "we decided" statements', () => {
      const result = heuristic.scan('We decided to use PostgreSQL');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('decision');
    });

    it('should detect "let\'s go with" statements', () => {
      const result = heuristic.scan("Let's go with the REST approach");
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('decision');
    });
  });

  describe('factual_knowledge', () => {
    it('should detect "project uses" statements', () => {
      const result = heuristic.scan('The project uses pnpm for package management');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('factual_knowledge');
    });

    it('should detect "endpoint is" statements', () => {
      const result = heuristic.scan('The API endpoint is /v2/users');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('factual_knowledge');
    });
  });

  describe('no match', () => {
    it('should not trigger on unrelated text', () => {
      const result = heuristic.scan('How do I sort an array in JavaScript?');
      expect(result.triggered).toBe(false);
    });

    it('should not trigger on empty text', () => {
      const result = heuristic.scan('');
      expect(result.triggered).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('should match regardless of case', () => {
      const result = heuristic.scan('MY NAME IS Dave');
      expect(result.triggered).toBe(true);
      expect(result.category).toBe('profile_info');
    });
  });
});
