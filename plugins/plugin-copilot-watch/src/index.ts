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
  watchJsonlSessionFiles,
  type SessionSource
} from "@agent-watch/plugin-sdk";

const DEFAULT_PATHS = ["~/.copilot/session-state", "~/.copilot"];
const SOURCE: SessionSource = "copilot";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function parseRecord(
  sourceHost: string,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
): NormalizedEvent {
  const data =
    record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : undefined;
  const sessionId =
    getStringValue(record.session_id) ||
    getStringValue(record.sessionId) ||
    getStringValue(record.conversation_id) ||
    getStringValue(data?.sessionId) ||
    path.basename(path.dirname(filePath));
  const entityId = `copilot:session:${sessionId}`;

  const timestamp =
    getStringValue(record.timestamp) ||
    getStringValue(record.created_at) ||
    getStringValue(record.createdAt) ||
    fallbackTimestamp;

  const eventType =
    getStringValue(record.event_type) ||
    getStringValue(record.type) ||
    "message";

  const summary =
    getStringValue(data?.content) ||
    getStringValue(record.summary) ||
    getStringValue(record.message) ||
    getStringValue(record.text) ||
    getStringValue(record.content);

  const detail =
    getStringValue(data?.selectedModel) ||
    getStringValue(record.detail) ||
    getStringValue(record.content) ||
    getStringValue(record.raw);

  const rawActivity = typeof record.activityScore === "number" ? record.activityScore : undefined;
  const activityScore = rawActivity ?? (eventType.startsWith("tool") ? 0.85 : 0.6);

  const event = {
    eventId: makeDeterministicEventId({
      source: "copilot",
      entityId,
      timestamp,
      eventType,
      sequence,
      detail: detail || summary
    }),
    timestamp,
    source: "copilot",
    sourceHost,
    entityId,
    sessionId,
    parentEntityId: null,
    entityKind: "session" as const,
    displayName: "Copilot",
    eventType,
    status: getStringValue(record.status, "active"),
    summary: summary || "Copilot activity",
    detail: detail || undefined,
    activityScore: Math.max(0, Math.min(1, activityScore)),
    sequence,
    meta: {
      filePath,
      toolName: getStringValue(record.toolName) || getStringValue(record.tool_name),
      rawType: getStringValue(record.type),
      model: getStringValue(data?.selectedModel) || undefined
    }
  };

  return parseNormalizedEvent(event);
}

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
    return watchJsonlSessionFiles(root, ctx, {
      matchFile: MATCH_SESSION_FILE,
      activeWindowMs,
      parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
        parseRecord(root.host, filePath, record, sequence, fallbackTimestamp)
    });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new CopilotWatchPlugin();
}
