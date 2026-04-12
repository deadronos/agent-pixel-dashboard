import path from "node:path";

import { makeDeterministicEventId, parseNormalizedEvent, type NormalizedEvent } from "@agent-watch/event-schema";
import type {
  CollectorPlugin,
  DiscoveredSessionRoot,
  PluginContext,
  WatchContext,
  WatchHandle
} from "@agent-watch/plugin-sdk";
import {
  discoverSessionRoots,
  getStringValue,
  matchesSessionFile,
  watchJsonSessionFiles,
  type SessionSource
} from "@agent-watch/plugin-sdk";

const DEFAULT_PATHS = ["~/.gemini/tmp", "~/.gemini"];
const SOURCE: SessionSource = "gemini";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function parseGeminiSessionFile(
  sourceHost: string,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
): NormalizedEvent {
  const sessionId =
    getStringValue(record.sessionId) ||
    path.basename(filePath).replace(/^session-/, "").replace(/\.json$/, "");
  const entityId = `gemini:session:${sessionId}`;
  const messages = Array.isArray(record.messages) ? (record.messages as Array<Record<string, unknown>>) : [];
  const lastMessage = messages.at(-1) ?? {};
  const lastToolCall =
    [...messages].reverse().find((message) => Array.isArray(message.toolCalls) && message.toolCalls.length > 0) ?? null;

  const timestamp =
    getStringValue(record.timestamp) ||
    getStringValue(record.created_at) ||
    getStringValue(record.createdAt) ||
    fallbackTimestamp;

  const eventType =
    getStringValue(lastMessage.type) ||
    "message";

  const summary =
    getStringValue(lastMessage.content) ||
    getStringValue(record.summary) ||
    "Gemini activity";

  const detail =
    getStringValue(record.projectHash) ||
    getStringValue(record.cwd);

  const rawActivity = typeof record.activityScore === "number" ? record.activityScore : undefined;
  const activityScore = rawActivity ?? (eventType.startsWith("tool") ? 0.85 : 0.6);
  const model =
    getStringValue(lastMessage.model) ||
    getStringValue(
      lastToolCall && Array.isArray(lastToolCall.toolCalls)
        ? (lastToolCall.toolCalls[0] as Record<string, unknown>)?.model
        : undefined
    );

  const event = {
    eventId: makeDeterministicEventId({
      source: "gemini",
      entityId,
      timestamp,
      eventType,
      sequence,
      detail: detail || summary
    }),
    timestamp,
    source: "gemini",
    sourceHost,
    entityId,
    sessionId,
    parentEntityId: null,
    entityKind: "session" as const,
    displayName: "Gemini",
    eventType,
    status: getStringValue(record.status, "active"),
    summary: summary || "Gemini activity",
    detail: detail || undefined,
    activityScore: Math.max(0, Math.min(1, activityScore)),
    sequence,
    meta: {
      filePath,
      groupKey: detail || undefined,
      toolName:
        lastToolCall && Array.isArray(lastToolCall.toolCalls)
          ? getStringValue((lastToolCall.toolCalls[0] as Record<string, unknown>)?.name)
          : undefined,
      rawType: getStringValue(lastMessage.type),
      model: model || undefined
    }
  };

  return parseNormalizedEvent(event);
}

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
