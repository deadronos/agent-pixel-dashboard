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
  getFirstTextContent,
  getFirstToolCallFromContent,
  getStringValue,
  matchesSessionFile,
  watchJsonlSessionFiles,
  type SessionSource
} from "@agent-watch/plugin-sdk";

const DEFAULT_PATHS = ["~/.claude/projects"];
const SOURCE: SessionSource = "claude";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

export function getClaudeProjectKey(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "/.claude/projects/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const projectSegment = normalized.slice(markerIndex + marker.length).split("/")[0]?.trim();
  return projectSegment ? projectSegment : undefined;
}

function getMessage(record: Record<string, unknown>): Record<string, unknown> | undefined {
  return record.message && typeof record.message === "object" ? (record.message as Record<string, unknown>) : undefined;
}

function getClaudeTool(record: Record<string, unknown>) {
  return getFirstToolCallFromContent(getMessage(record)?.content);
}

function getClaudeText(record: Record<string, unknown>): string {
  const message = getMessage(record);
  return getFirstTextContent(message?.content) ||
    getStringValue(record.summary) ||
    getStringValue(record.message) ||
    getStringValue(record.text) ||
    getStringValue(record.content);
}

function getClaudeRole(record: Record<string, unknown>): string | undefined {
  return getStringValue(getMessage(record)?.role) || undefined;
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
  getEventType: ({ record }) => getClaudeTool(record) ? "tool_use" : getStringValue(record.event_type) || getStringValue(record.type) || "message",
  getStatus: ({ record }) => getStringValue(record.status) || "active",
  getSummary: ({ record }) =>
    getClaudeTool(record)?.name ||
    getClaudeText(record) ||
    "Claude activity",
  getDetail: ({ record }) =>
    getClaudeTool(record)?.detail ||
    getClaudeRole(record) ||
    getStringValue(record.detail) ||
    getStringValue(record.raw) ||
    undefined,
  getActivityScore: ({ eventType, record }) => getDefaultActivityScore(eventType, record.activityScore),
  getMeta: ({ filePath, record }) => ({
    filePath,
    groupKey: getClaudeProjectKey(filePath),
    toolName: getClaudeTool(record)?.name || getStringValue(record.toolName) || getStringValue(record.tool_name) || undefined,
    role: getClaudeRole(record),
    rawType: getStringValue(record.type),
    model: getStringValue(getMessage(record)?.model) || undefined
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
      depth: 3,
      parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
        parseClaudeRecord(root.host, filePath, record, sequence, fallbackTimestamp)
    });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new ClaudeWatchPlugin();
}
