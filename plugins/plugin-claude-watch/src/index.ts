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

const DEFAULT_PATHS = ["~/.claude/projects", "~/.claude"];
const SOURCE: SessionSource = "claude";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

export function getClaudeProjectKey(filePath: string): string | undefined {
  const normalized = filePath.replace(/\/g, "/");
  const marker = "/.claude/projects/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const projectSegment = normalized.slice(markerIndex + marker.length).split("/")[0]?.trim();
  return projectSegment ? projectSegment : undefined;
}

export const parseClaudeRecord = createNormalizedSessionParser({
  source: "claude",
  defaultDisplayName: "Claude",
  defaultSummary: "Claude activity",
  getSessionId: ({ filePath, record }) =>
    getStringValue(record.session_id) ||
    getStringValue(record.sessionId) ||
    getStringValue(record.conversation_id) ||
    path.basename(filePath).replace(/\.jsonl$/, ""),
  getTimestamp: ({ record, fallbackTimestamp }) =>
    getStringValue(record.timestamp) ||
    getStringValue(record.created_at) ||
    getStringValue(record.createdAt) ||
    fallbackTimestamp,
  getEventType: ({ record }) => getStringValue(record.event_type) || getStringValue(record.type) || "message",
  getStatus: ({ record }) => getStringValue(record.status) || "active",
  getSummary: ({ record }) =>
    getStringValue(record.summary) ||
    getStringValue(record.message) ||
    getStringValue(record.text) ||
    getStringValue(record.content),
  getDetail: ({ record }) =>
    getStringValue(record.detail) ||
    getStringValue(record.content) ||
    getStringValue(record.raw),
  getActivityScore: ({ eventType, record }) => getDefaultActivityScore(eventType, record.activityScore),
  getMeta: ({ filePath, record }) => ({
    filePath,
    groupKey: getClaudeProjectKey(filePath),
    toolName: getStringValue(record.toolName) || getStringValue(record.tool_name),
    rawType: getStringValue(record.type)
  })
});

export class ClaudeWatchPlugin implements CollectorPlugin {
  id = "plugin-claude-watch";
  source = "claude";

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    return discoverSessionRoots(config, {
      envVar: "CLAUDE_SESSION_ROOTS",
      defaultRoots: DEFAULT_PATHS,
      idPrefix: "claude-root"
    });
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const activeWindowMs = Number(process.env.CLAUDE_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    return watchJsonlSessionFiles(root, ctx, {
      matchFile: MATCH_SESSION_FILE,
      activeWindowMs,
      parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
        parseClaudeRecord(root.host, filePath, record, sequence, fallbackTimestamp)
    });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new ClaudeWatchPlugin();
}
