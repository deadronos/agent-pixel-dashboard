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
  watchJsonlSessionFilesByPolling,
  type SessionSource
} from "@agent-watch/plugin-sdk";

const DEFAULT_PATHS = ["~/.copilot/session-state"];
const DEFAULT_SCAN_INTERVAL_MS = 2000;
const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_FILES = 5000;
const SOURCE: SessionSource = "copilot";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function getData(record: Record<string, unknown>): Record<string, unknown> | undefined {
  return record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : undefined;
}

export const parseCopilotRecord = createNormalizedSessionParser({
  source: "copilot",
  defaultDisplayName: "Copilot",
  defaultSummary: "Copilot activity",
  getSessionId: ({ filePath, record }) =>
    getStringValue(record.session_id) ||
    getStringValue(record.sessionId) ||
    getStringValue(record.conversation_id) ||
    getStringValue(getData(record)?.sessionId) ||
    path.basename(path.dirname(filePath)),
  getTimestamp: ({ record, fallbackTimestamp }) =>
    getStringValue(record.timestamp) ||
    getStringValue(record.created_at) ||
    getStringValue(record.createdAt) ||
    fallbackTimestamp,
  getEventType: ({ record }) => getStringValue(record.event_type) || getStringValue(record.type) || "message",
  getStatus: ({ record }) => getStringValue(record.status) || "active",
  getSummary: ({ record }) =>
    getStringValue(getData(record)?.content) ||
    getStringValue(record.summary) ||
    getStringValue(record.message) ||
    getStringValue(record.text) ||
    getStringValue(record.content),
  getDetail: ({ record }) =>
    getStringValue(getData(record)?.selectedModel) ||
    getStringValue(record.detail) ||
    getStringValue(record.content) ||
    getStringValue(record.raw),
  getActivityScore: ({ eventType, record }) => getDefaultActivityScore(eventType, record.activityScore),
  getMeta: ({ filePath, record }) => ({
    filePath,
    toolName: getStringValue(record.toolName) || getStringValue(record.tool_name),
    rawType: getStringValue(record.type),
    model: getStringValue(getData(record)?.selectedModel) || undefined
  })
});

export class CopilotWatchPlugin implements CollectorPlugin {
  id = "plugin-copilot-watch";
  source = "copilot";

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    return discoverSessionRoots(config, {
      envVar: "COPILOT_SESSION_ROOTS",
      defaultRoots: DEFAULT_PATHS,
      idPrefix: "copilot-root"
    });
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const activeWindowMs = Number(process.env.COPILOT_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    const scanIntervalMs = Number(process.env.COPILOT_SCAN_INTERVAL_MS ?? DEFAULT_SCAN_INTERVAL_MS);
    const maxDepth = Number(process.env.COPILOT_SCAN_MAX_DEPTH ?? DEFAULT_MAX_DEPTH);
    const maxFiles = Number(process.env.COPILOT_SCAN_MAX_FILES ?? DEFAULT_MAX_FILES);
    return watchJsonlSessionFilesByPolling(root, ctx, {
      matchFile: MATCH_SESSION_FILE,
      activeWindowMs,
      parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
        parseCopilotRecord(root.host, filePath, record, sequence, fallbackTimestamp),
      scanIntervalMs: Number.isFinite(scanIntervalMs) ? scanIntervalMs : DEFAULT_SCAN_INTERVAL_MS,
      maxDepth: Number.isFinite(maxDepth) ? maxDepth : DEFAULT_MAX_DEPTH,
      maxFiles: Number.isFinite(maxFiles) ? maxFiles : DEFAULT_MAX_FILES
    });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new CopilotWatchPlugin();
}
