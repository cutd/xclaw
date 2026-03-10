import { describe, it, expect } from 'vitest';
import { ChatCommandsSkill } from './chatCommandsSkill.js';

describe('ChatCommandsSkill', () => {
  const skill = new ChatCommandsSkill();

  describe('manifest', () => {
    it('should have correct type and name', () => {
      expect(skill.manifest.type).toBe('skill');
      expect(skill.manifest.name).toBe('chat-commands');
    });
  });

  describe('tools', () => {
    it('should expose 6 tools', () => {
      expect(skill.tools).toHaveLength(6);
      const names = skill.tools.map((t) => t.name);
      expect(names).toContain('chat_status');
      expect(names).toContain('chat_new');
      expect(names).toContain('chat_reset');
      expect(names).toContain('chat_compact');
      expect(names).toContain('chat_think');
      expect(names).toContain('chat_verbose');
    });
  });

  describe('chat_status', () => {
    it('should return session status', async () => {
      const result = await skill.execute('chat_status', { sessionId: 'sess-1' }) as any;
      expect(result).toHaveProperty('sessionId');
    });
  });

  describe('chat_new', () => {
    it('should return new session instruction', async () => {
      const result = await skill.execute('chat_new', {}) as any;
      expect(result).toHaveProperty('action', 'new_session');
    });
  });

  describe('chat_reset', () => {
    it('should return reset instruction', async () => {
      const result = await skill.execute('chat_reset', { sessionId: 'sess-1' }) as any;
      expect(result).toHaveProperty('action', 'reset');
    });
  });

  describe('chat_compact', () => {
    it('should return compact instruction', async () => {
      const result = await skill.execute('chat_compact', { sessionId: 'sess-1' }) as any;
      expect(result).toHaveProperty('action', 'compact');
    });
  });

  describe('chat_think', () => {
    it('should set reasoning level', async () => {
      const result = await skill.execute('chat_think', { level: 'thorough' }) as any;
      expect(result).toHaveProperty('level', 'thorough');
    });
  });

  describe('chat_verbose', () => {
    it('should toggle verbose mode', async () => {
      const result = await skill.execute('chat_verbose', { enabled: true }) as any;
      expect(result).toHaveProperty('verbose', true);
    });
  });

  describe('error handling', () => {
    it('should return error for unknown tool', async () => {
      const result = await skill.execute('unknown', {}) as any;
      expect(result).toHaveProperty('error');
    });
  });
});
