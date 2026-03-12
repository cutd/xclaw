import { describe, it, expect } from 'vitest';
import { detectPluginFormat } from './loader.js';

describe('detectPluginFormat', () => {
  it('should detect xclaw native format', () => {
    const pkg = { name: 'test', keywords: ['xclaw-plugin'] };
    expect(detectPluginFormat(pkg)).toBe('xclaw');
  });

  it('should detect openclaw format', () => {
    const pkg = { name: 'test', keywords: ['openclaw-extension'] };
    expect(detectPluginFormat(pkg)).toBe('openclaw');
  });

  it('should detect mcp format from engines', () => {
    const pkg = { name: 'test', keywords: [], engines: { mcp: '>=1.0.0' } };
    expect(detectPluginFormat(pkg)).toBe('mcp');
  });

  it('should return unknown for unrecognized format', () => {
    const pkg = { name: 'test' };
    expect(detectPluginFormat(pkg)).toBe('unknown');
  });

  it('detects xclaw-extension keyword as xclaw format', () => {
    expect(detectPluginFormat({ keywords: ['xclaw-extension'] })).toBe('xclaw');
  });

});
