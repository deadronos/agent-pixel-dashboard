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

const DEFAULT_PATHS = ["~/.codex/sessions", "~/.codex"];
const SOURCE: SessionSource = "codex";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function parseRecord(
  sourceHost: string,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
): NormalizedEvent {
  const payload =
    record.payload && typeof record.payload === "object" ? (record.payload as Record<string, unknown>) : undefined;
  const sessionId =
    getStringValue(record.session_id) ||
    getStringValue(record.sessionId) ||
    getStringValue(payload?.id) ||
    path.basename(filePath).replace(/^rollout-/, "").replace(/\.jsonl$/, "");
  const entityId = `codex:session:${sessionId}`;

  const timestamp =
    getStringValue(record.timestamp) ||
    getStringValue(record.created_at) ||
    fallbackTimestamp;

  const eventType =
    getStringValue(record.event_type) ||
    getStringValue(record.type) ||
    getStringValue(payload?.type) ||
    "message";

  const summary =
    getStringValue(payload?.name) ||
    getStringValue(payload?.command) ||
    getStringValue(record.summary) ||
    getStringValue(record.message) ||
    getStringValue(record.text);

  const detail =
    getStringValue(payload?.arguments) ||
    getStringValue(record.detail) ||
    getStringValue(record.content);

  const rawActivity = typeof record.activityScore === "number" ? record.activityScore : undefined;
  const activityScore = rawActivity ?? (eventType.startsWith("tool") ? 0.85 : 0.6);

  const event = {
    eventId: makeDeterministicEventId({
      source: "codex",
      entityId,
      timestamp,
      eventType,
      sequence,
      detail: detail || summary
    }),
    timestamp,
    source: "codex",
    sourceHost,
    entityId,
    sessionId,
    parentEntityId: null,
    entityKind: "session" as const,
    displayName: "Codex",
    eventType,
    status: getStringValue(record.status, "active"),
    summary: summary || "Codex activity",
    detail: detail || undefined,
    activityScore: Math.max(0, Math.min(1, activityScore)),
    sequence,
    meta: {
      filePath,
      toolName:
        getStringValue(payload?.name) || getStringValue(record.toolName) || getStringValue(record.tool_name),
      rawType: getStringValue(record.type),
      model: getStringValue(payload?.model) || undefined
    }
  };

  return parseNormalizedEvent(event);
}

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
        parseRecord(root.host, filePath, record, sequence, fallbackTimestamp)
    });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new CodexWatchPlugin();
}
