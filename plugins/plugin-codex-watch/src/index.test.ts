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

describe('codex watch helpers', () => {
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
});
