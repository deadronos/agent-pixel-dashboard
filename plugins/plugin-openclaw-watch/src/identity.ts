import path from 'node:path';

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function encodeSessionKey(value: string): string {
  return encodeURIComponent(value);
}

export function decodeSessionKey(value: string): string {
  return decodeURIComponent(value);
}

export function getOpenClawAgentId(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/\/\.openclaw\/agents\/([^/]+)\/sessions\/[^/]+\.jsonl$/);
  return match ? decodeSessionKey(match[1]) : null;
}

export function buildOpenClawSessionId(
  agentId: string | null,
  filePath: string,
  record?: Record<string, unknown>
): string {
  const explicitId =
    getString(record?.session_id) ||
    getString(record?.sessionId) ||
    getString(record?.conversation_id) ||
    getString(record?.id);
  const fileId = explicitId || path.basename(filePath).replace(/\.jsonl$/, '');
  if (!agentId) {
    return `openclaw-${fileId}`;
  }
  return `openclaw:${encodeSessionKey(agentId)}:${encodeSessionKey(fileId)}`;
}
