import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

function expandHome(input: string): string {
  if (!input.startsWith('~')) {
    return input;
  }
  return path.join(os.homedir(), input.slice(1));
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function getClaudeProjectKey(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, '/');
  const marker = '/.claude/projects/';
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const projectSegment = normalized
    .slice(markerIndex + marker.length)
    .split('/')[0]
    ?.trim();
  return projectSegment ? projectSegment : undefined;
}

describe('claude watch helpers', () => {
  describe('expandHome', () => {
    it('returns input unchanged when not starting with ~', () => {
      const input = '/some/path';
      expect(expandHome(input)).toBe(input);
    });

    it('expands ~ to home directory', () => {
      const input = '~/some/path';
      expect(expandHome(input)).toBe(path.join(os.homedir(), 'some/path'));
    });
  });

  describe('getString', () => {
    it('returns string value as-is', () => {
      expect(getString('hello')).toBe('hello');
    });

    it('returns fallback for non-string values', () => {
      expect(getString(123, 'fallback')).toBe('fallback');
      expect(getString(null, 'fallback')).toBe('fallback');
      expect(getString(undefined, 'fallback')).toBe('fallback');
      expect(getString({}, 'fallback')).toBe('fallback');
    });

    it('uses empty string as default fallback', () => {
      expect(getString(123)).toBe('');
    });
  });

  describe('getClaudeProjectKey', () => {
    it('extracts project name from standard project path', () => {
      const filePath = '/Users/test/.claude/projects/my-project/sessions/abc.jsonl';
      expect(getClaudeProjectKey(filePath)).toBe('my-project');
    });

    it('returns undefined when not in projects directory', () => {
      const filePath = '/Users/test/.claude/sessions/abc.jsonl';
      expect(getClaudeProjectKey(filePath)).toBe(undefined);
    });

    it('handles windows-style backslashes', () => {
      const filePath = 'C:\\Users\\test\\.claude\\projects\\work-project\\sessions\\abc.jsonl';
      expect(getClaudeProjectKey(filePath)).toBe('work-project');
    });

    it('returns undefined for empty project segment', () => {
      const filePath = '/Users/test/.claude/projects//sessions/abc.jsonl';
      expect(getClaudeProjectKey(filePath)).toBe(undefined);
    });

    it('handles deeply nested project paths', () => {
      const filePath = '/home/user/.claude/projects/nested/deep/path/sessions/abc.jsonl';
      expect(getClaudeProjectKey(filePath)).toBe('nested');
    });
  });
});
