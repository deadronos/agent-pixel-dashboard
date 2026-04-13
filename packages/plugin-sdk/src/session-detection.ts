import path from 'node:path';

export type SessionSource = 'codex' | 'claude' | 'gemini' | 'openclaw' | 'copilot';

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function matchesSessionFile(source: SessionSource, filePath: string): boolean {
  const normalized = normalizePath(filePath);
  const base = path.basename(normalized);

  switch (source) {
    case 'codex':
      return (
        normalized.includes('/.codex/sessions/') &&
        base.startsWith('rollout-') &&
        base.endsWith('.jsonl')
      );
    case 'claude':
      return normalized.includes('/.claude/projects/') && base.endsWith('.jsonl');
    case 'gemini':
      return (
        normalized.includes('/.gemini/tmp/') &&
        normalized.includes('/chats/') &&
        base.startsWith('session-') &&
        base.endsWith('.json')
      );
    case 'openclaw':
      return (
        normalized.includes('/.openclaw/agents/') &&
        normalized.includes('/sessions/') &&
        base.endsWith('.jsonl')
      );
    case 'copilot':
      return normalized.includes('/.copilot/session-state/') && base === 'events.jsonl';
    default:
      return false;
  }
}

export function isActiveSessionFile(
  mtimeMs: number,
  nowMs = Date.now(),
  activeWindowMs = 2 * 60 * 1000
): boolean {
  return nowMs - mtimeMs <= activeWindowMs;
}
