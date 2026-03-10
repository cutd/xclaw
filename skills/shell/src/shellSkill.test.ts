// skills/shell/src/shellSkill.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ShellSkill } from './shellSkill.js';

describe('ShellSkill', () => {
  const skill = new ShellSkill();

  describe('manifest', () => {
    it('should have correct type and name', () => {
      expect(skill.manifest.type).toBe('skill');
      expect(skill.manifest.name).toBe('shell');
      expect(skill.manifest.permissions?.system).toContain('exec');
    });
  });

  describe('tools', () => {
    it('should expose shell_exec tool', () => {
      expect(skill.tools).toHaveLength(1);
      expect(skill.tools[0].name).toBe('shell_exec');
    });
  });

  describe('execute', () => {
    it('should execute a simple command', async () => {
      const result = await skill.execute('shell_exec', { command: 'echo hello' }) as any;
      expect(result.stdout.trim()).toBe('hello');
      expect(result.exitCode).toBe(0);
    });

    it('should capture stderr', async () => {
      const result = await skill.execute('shell_exec', { command: 'ls /nonexistent_path_xyz' }) as any;
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    });

    it('should respect timeout', async () => {
      const result = await skill.execute('shell_exec', { command: 'sleep 10', timeout: 500 }) as any;
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('timed out');
    }, 5000);

    it('should return error for unknown tool', async () => {
      const result = await skill.execute('unknown_tool', {});
      expect(result).toHaveProperty('error');
    });

    it('should handle empty command', async () => {
      const result = await skill.execute('shell_exec', { command: '' }) as any;
      expect(result).toHaveProperty('error');
    });
  });
});
