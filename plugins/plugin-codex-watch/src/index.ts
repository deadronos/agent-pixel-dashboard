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
  getDefaultActivityScore,
  getStringValue,
  matchesSessionFile,
  watchJsonlSessionFiles,
  type SessionSource
} from "@agent-watch/plugin-sdk";

const DEFAULT_PATHS = ["~/.codex/sessions", "~/.codex"];
const SOURCE: SessionSource = "codex";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function getPayload(record: Record<string, unknown>): Record<string, unknown> | undefined {
  return record.payload && typeof record.payload === "object" ? (record.payload as Record<string, unknown>) : undefined;
}

export const parseCodexRecord = createNormalizedSessionParser({
  source: "codex",
  defaultDisplayName: "Codex",
  defaultSummary: "Codex activity",
  getSessionId: ({ filePath, record }) =>
    getStringValue(record.session_id) ||
    getStringValue(record.sessionId) ||
    getStringValue(getPayload(record)?.id) ||
    path.basename(filePath).replace(/^rollout-/, "").replace(/\.jsonl$/, ""),
  getTimestamp: ({ record, fallbackTimestamp }) =>
    getStringValue(record.timestamp) ||
    getStringValue(record.created_at) ||
    fallbackTimestamp,
  getEventType: ({ record }) =>
    getStringValue(record.event_type) ||
    getStringValue(record.type) ||
    getStringValue(getPayload(record)?.type) ||
    "message",
  getStatus: ({ record }) => getStringValue(record.status) || "active",
  getSummary: ({ record }) =>
    getStringValue(getPayload(record)?.name) ||
    getStringValue(getPayload(record)?.command) ||
    getStringValue(record.summary) ||
    getStringValue(record.message) ||
    getStringValue(record.text),
  getDetail: ({ record }) =>
    getStringValue(getPayload(record)?.arguments) ||
    getStringValue(record.detail) ||
    getStringValue(record.content),
  getActivityScore: ({ eventType, record }) => getDefaultActivityScore(eventType, record.activityScore),
  getMeta: ({ filePath, record }) => ({
    filePath,
    toolName:
      getStringValue(getPayload(record)?.name) ||
      getStringValue(record.toolName) ||
      getStringValue(record.tool_name),
    rawType: getStringValue(record.type),
    model: getStringValue(getPayload(record)?.model) || undefined
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
      parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
        parseCodexRecord(root.host, filePath, record, sequence, fallbackTimestamp)
    });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new CodexWatchPlugin();
}
