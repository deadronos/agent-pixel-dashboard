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
  getStringValue,
  matchesSessionFile,
  summarizeToolInput,
  watchJsonlSessionFiles,
  watchJsonSessionFiles,
  type SessionSource
} from "@agent-watch/plugin-sdk";

const DEFAULT_PATHS = ["~/.gemini/tmp"];
const SOURCE: SessionSource = "gemini";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function getMessages(record: Record<string, unknown>): Array<Record<string, unknown>> {
  return Array.isArray(record.messages) ? (record.messages as Array<Record<string, unknown>>) : [];
}

function getLastMessage(record: Record<string, unknown>): Record<string, unknown> {
  return getMessages(record).at(-1) ?? record;
}

function getGeminiSessionId(filePath: string): string {
  return path.basename(filePath).replace(/^session-/, "").replace(/\.jsonl?$/, "");
}

function getProjectKey(filePath: string, record: Record<string, unknown>): string | undefined {
  return getStringValue(record.projectHash) ||
    getStringValue(record.cwd) ||
    path.basename(path.dirname(path.dirname(filePath))) ||
    undefined;
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
  getSessionId: ({ filePath }) => getGeminiSessionId(filePath),
  getTimestamp: ({ record, fallbackTimestamp }) =>
    getStringValue(record.timestamp) ||
    getStringValue(record.lastUpdated) ||
    getStringValue(record.created_at) ||
    getStringValue(record.createdAt) ||
    fallbackTimestamp,
  getEventType: ({ record }) => getStringValue(getLastMessage(record).type) || "message",
  getStatus: ({ record }) => getStringValue(record.status) || "active",
  getSummary: ({ record }) =>
    getFirstTextContent(getLastMessage(record).content) ||
    getStringValue(getFirstToolCallDetail(record)?.name) ||
    getStringValue(record.summary) ||
    "Gemini activity",
  getDetail: ({ filePath, record }) =>
    summarizeToolInput(getFirstToolCallDetail(record)?.args) ||
    summarizeToolInput(getFirstToolCallDetail(record)?.arguments) ||
    getProjectKey(filePath, record),
  getActivityScore: ({ eventType, record }) => getDefaultActivityScore(eventType, record.activityScore),
  getMeta: ({ filePath, record }) => ({
    filePath,
    groupKey: getProjectKey(filePath, record),
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
    const depth = 3;
    const jsonHandle = await watchJsonSessionFiles(root, ctx, {
      matchFile: (filePath: string) => MATCH_SESSION_FILE(filePath) && filePath.endsWith(".json"),
      activeWindowMs,
      depth,
      parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
        parseGeminiSessionFile(root.host, filePath, record, sequence, fallbackTimestamp)
    });
    const jsonlHandle = await watchJsonlSessionFiles(root, ctx, {
      matchFile: (filePath: string) => MATCH_SESSION_FILE(filePath) && filePath.endsWith(".jsonl"),
      activeWindowMs,
      depth,
      parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
        parseGeminiSessionFile(root.host, filePath, record, sequence, fallbackTimestamp)
    });

    return {
      close: async () => {
        await Promise.all([jsonHandle.close(), jsonlHandle.close()]);
      }
    };
  }
}

export default function createPlugin(): CollectorPlugin {
  return new GeminiWatchPlugin();
}
