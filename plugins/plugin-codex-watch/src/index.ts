import path from "node:path";

import type {
  CollectorPlugin,
  DiscoveredSessionRoot,
  PluginContext,
  WatchContext,
  WatchHandle
} from "@agent-watch/plugin-sdk";
import {
  createNormalizedSessionParser,
  discoverSessionRoots,
  getFirstTextContent,
  getDefaultActivityScore,
  getStringValue,
  getToolCall,
  matchesSessionFile,
  watchJsonlSessionFiles,
  type SessionSource
} from "@agent-watch/plugin-sdk";

const DEFAULT_PATHS = ["~/.codex/sessions"];
const SOURCE: SessionSource = "codex";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function getPayload(record: Record<string, unknown>): Record<string, unknown> | undefined {
  return record.payload && typeof record.payload === "object" ? (record.payload as Record<string, unknown>) : undefined;
}

function getCodexPayload(record: Record<string, unknown>): Record<string, unknown> {
  return getPayload(record) ?? record;
}

function getCodexEventType(record: Record<string, unknown>): string {
  const payload = getCodexPayload(record);
  return getStringValue(record.event_type) ||
    getStringValue(payload.type) ||
    getStringValue(record.type) ||
    "message";
}

function getCodexTool(record: Record<string, unknown>) {
  return getToolCall(getCodexPayload(record));
}

function getCodexRole(record: Record<string, unknown>): string | undefined {
  const role = getStringValue(getCodexPayload(record).role);
  return role || undefined;
}

function getCodexText(record: Record<string, unknown>): string {
  const payload = getCodexPayload(record);
  return getFirstTextContent(payload.content) ||
    getStringValue(payload.text) ||
    getStringValue(record.message) ||
    getStringValue(record.text) ||
    getStringValue(record.content);
}

export const parseCodexRecord = createNormalizedSessionParser({
  source: "codex",
  defaultDisplayName: "Codex",
  defaultSummary: "Codex activity",
  getSessionId: ({ filePath, record }) =>
    getStringValue(record.session_id) ||
    getStringValue(record.sessionId) ||
    getStringValue(getCodexPayload(record).id) ||
    path.basename(filePath).replace(/^rollout-/, "").replace(/\.jsonl$/, ""),
  getTimestamp: ({ record, fallbackTimestamp }) =>
    getStringValue(record.timestamp) ||
    getStringValue(record.created_at) ||
    fallbackTimestamp,
  getEventType: ({ record }) => getCodexEventType(record),
  getStatus: ({ record }) => getStringValue(record.status) || "active",
  getSummary: ({ record }) =>
    getCodexTool(record)?.name ||
    getCodexText(record) ||
    getStringValue(record.summary) ||
    "Codex activity",
  getDetail: ({ record }) =>
    getCodexTool(record)?.detail ||
    getCodexRole(record) ||
    getStringValue(record.detail) ||
    undefined,
  getActivityScore: ({ eventType, record }) => getDefaultActivityScore(eventType, record.activityScore),
  getMeta: ({ filePath, record }) => ({
    filePath,
    toolName: getCodexTool(record)?.name ||
      getStringValue(record.toolName) ||
      getStringValue(record.tool_name) ||
      undefined,
    role: getCodexRole(record),
    rawType: getStringValue(record.type),
    model: getStringValue(getCodexPayload(record).model) || undefined
  })
});

export class CodexWatchPlugin implements CollectorPlugin {
  id = "plugin-codex-watch";
  source = "codex";

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    return discoverSessionRoots(config, {
      envVar: "CODEX_SESSION_ROOTS",
      defaultRoots: DEFAULT_PATHS,
      idPrefix: "codex-root"
    });
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const activeWindowMs = Number(process.env.CODEX_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    return watchJsonlSessionFiles(root, ctx, {
      matchFile: MATCH_SESSION_FILE,
      activeWindowMs,
      depth: 2,
      parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
        parseCodexRecord(root.host, filePath, record, sequence, fallbackTimestamp)
    });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new CodexWatchPlugin();
}
