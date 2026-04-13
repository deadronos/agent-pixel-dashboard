import path from "node:path";

import { getStringValue } from "@agent-watch/plugin-sdk";

export function encodeSessionKey(value: string): string {
  return encodeURIComponent(value);
}

export function decodeSessionKey(value: string): string {
  return decodeURIComponent(value);
}

export function getOpenClawAgentId(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(/\/\.openclaw\/agents\/([^/]+)\/sessions\/[^/]+\.jsonl$/);
  return match ? decodeSessionKey(match[1]) : null;
}

export function buildOpenClawSessionId(agentId: string | null, filePath: string, record?: Record<string, unknown>): string {
  const explicitId =
    getStringValue(record?.session_id) ||
    getStringValue(record?.sessionId) ||
    getStringValue(record?.conversation_id) ||
    getStringValue(record?.id);
  const fileId = explicitId || path.basename(filePath).replace(/\.jsonl$/, "");
  if (!agentId) {
    return `openclaw-${fileId}`;
  }
  return `openclaw:${encodeSessionKey(agentId)}:${encodeSessionKey(fileId)}`;
}
