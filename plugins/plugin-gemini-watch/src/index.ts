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
  watchJsonSessionFiles,
  type SessionSource
} from "@agent-watch/plugin-sdk";

const DEFAULT_PATHS = ["~/.gemini/tmp", "~/.gemini"];
const SOURCE: SessionSource = "gemini";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function getMessages(record: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(record.messages) ? (record.messages as Array<Record<string, unknown>>) : [];
}

function getLastMessage(record: Record<string, unknown>): Record<string, unknown> {
  return getMessages(record).at(-1) ?? {};
}

function getFirstToolCallDetail(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const lastToolCall =
    [...getMessages(record)].reverse().find((message) => Array.isArray(message.toolCalls) && message.toolCalls.length > 0) ?? null;
  return lastToolCall && Array.isArray(lastToolCall.toolCalls)
    ? (lastToolCall.toolCalls[0] as Record<string, unknown>)
    : undefined;
}

export const parseGeminiSessionFile = createNormalizedSessionParser({
  source: "gemini",
  defaultDisplayName: "Gemini",
  defaultSummary: "Gemini activity",
  getSessionId: ({ filePath, record }) =>
    getStringValue(record.sessionId) ||
    path.basename(filePath).replace(/^session-/, "").replace(/\.json$/, ""),
  getTimestamp: ({ record, fallbackTimestamp }) =>
    getStringValue(record.timestamp) ||
    getStringValue(record.created_at) ||
    getStringValue(record.createdAt) ||
    fallbackTimestamp,
  getEventType: ({ record }) => getStringValue(getLastMessage(record).type) || "message",
  getStatus: ({ record }) => getStringValue(record.status) || "active",
  getSummary: ({ record }) =>
    getStringValue(getLastMessage(record).content) ||
    getStringValue(record.summary) ||
    "Gemini activity",
  getDetail: ({ record }) => getStringValue(record.projectHash) || getStringValue(record.cwd),
  getActivityScore: ({ eventType, record }) => getDefaultActivityScore(eventType, record.activityScore),
  getMeta: ({ filePath, record }) => ({
    filePath,
    groupKey: getStringValue(record.projectHash) || getStringValue(record.cwd) || undefined,
    toolName: getStringValue(getFirstToolCallDetail(record)?.name) || undefined,
    rawType: getStringValue(getLastMessage(record).type),
    model:
      getStringValue(getLastMessage(record).model) ||
      getStringValue(getFirstToolCallDetail(record)?.model) ||
      undefined
  })
});

export class GeminiWatchPlugin implements CollectorPlugin {
  id = "plugin-gemini-watch";
  source = "gemini";

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    return discoverSessionRoots(config, {
      envVar: "GEMINI_SESSION_ROOTS",
      defaultRoots: DEFAULT_PATHS,
      idPrefix: "gemini-root"
    });
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const activeWindowMs = Number(process.env.GEMINI_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    return watchJsonSessionFiles(root, ctx, {
      matchFile: MATCH_SESSION_FILE,
      activeWindowMs,
      parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
        parseGeminiSessionFile(root.host, filePath, record, sequence, fallbackTimestamp)
    });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new GeminiWatchPlugin();
}
