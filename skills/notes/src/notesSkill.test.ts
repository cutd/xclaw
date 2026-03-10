// skills/notes/src/notesSkill.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotesSkill } from './notesSkill.js';

describe('NotesSkill', () => {
  let skill: NotesSkill;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'xclaw-notes-'));
    skill = new NotesSkill(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('manifest', () => {
    it('should have correct type and name', () => {
      expect(skill.manifest.type).toBe('skill');
      expect(skill.manifest.name).toBe('notes');
      expect(skill.manifest.permissions?.filesystem).toBeDefined();
    });
  });

  describe('tools', () => {
    it('should expose 5 tools', () => {
      expect(skill.tools).toHaveLength(5);
      const names = skill.tools.map((t) => t.name);
      expect(names).toContain('notes_create');
      expect(names).toContain('notes_read');
      expect(names).toContain('notes_list');
      expect(names).toContain('notes_search');
      expect(names).toContain('notes_delete');
    });
  });

  describe('notes_create', () => {
    it('should create a note with frontmatter', async () => {
      const result = await skill.execute('notes_create', { title: 'Test Note', content: 'Hello world', tags: ['test'] }) as any;
      expect(result.filename).toBe('test-note.md');

      const read = await skill.execute('notes_read', { filename: 'test-note.md' }) as any;
      expect(read.title).toBe('Test Note');
      expect(read.content).toContain('Hello world');
      expect(read.tags).toContain('test');
    });

    it('should handle filename collision', async () => {
      await skill.execute('notes_create', { title: 'Dup', content: 'first' });
      const result = await skill.execute('notes_create', { title: 'Dup', content: 'second' }) as any;
      expect(result.filename).toBe('dup-2.md');
    });
  });

  describe('notes_list', () => {
    it('should list all notes', async () => {
      await skill.execute('notes_create', { title: 'A', content: 'aaa' });
      await skill.execute('notes_create', { title: 'B', content: 'bbb', tags: ['work'] });
      const result = await skill.execute('notes_list', {}) as any;
      expect(result.notes).toHaveLength(2);
    });

    it('should filter by tag', async () => {
      await skill.execute('notes_create', { title: 'A', content: 'aaa', tags: ['personal'] });
      await skill.execute('notes_create', { title: 'B', content: 'bbb', tags: ['work'] });
      const result = await skill.execute('notes_list', { tag: 'work' }) as any;
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].title).toBe('B');
    });
  });

  describe('notes_search', () => {
    it('should find notes by content', async () => {
      await skill.execute('notes_create', { title: 'Recipe', content: 'chocolate cake recipe' });
      await skill.execute('notes_create', { title: 'Meeting', content: 'discuss project plan' });
      const result = await skill.execute('notes_search', { query: 'chocolate' }) as any;
      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('Recipe');
    });
  });

  describe('notes_delete', () => {
    it('should delete a note', async () => {
      await skill.execute('notes_create', { title: 'ToDelete', content: 'bye' });
      const del = await skill.execute('notes_delete', { filename: 'todelete.md' }) as any;
      expect(del.deleted).toBe(true);
      const list = await skill.execute('notes_list', {}) as any;
      expect(list.notes).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should return error for unknown tool', async () => {
      const result = await skill.execute('unknown', {}) as any;
      expect(result).toHaveProperty('error');
    });

    it('should return error for missing note', async () => {
      const result = await skill.execute('notes_read', { filename: 'nonexistent.md' }) as any;
      expect(result).toHaveProperty('error');
    });
  });
});
