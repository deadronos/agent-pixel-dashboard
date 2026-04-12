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

const DEFAULT_PATHS = ["~/.claude/projects", "~/.claude"];
const SOURCE: SessionSource = "claude";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function getClaudeProjectKey(filePath: string): string | undefined {
  const normalized = filePath.replace(/\\/g, "/");
  const marker = "/.claude/projects/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const projectSegment = normalized.slice(markerIndex + marker.length).split("/")[0]?.trim();
  return projectSegment ? projectSegment : undefined;
}

function parseRecord(
  sourceHost: string,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
): NormalizedEvent {
  const sessionId =
    getStringValue(record.session_id) ||
    getStringValue(record.sessionId) ||
    getStringValue(record.conversation_id) ||
    path.basename(filePath).replace(/\.jsonl$/, "");
  const entityId = `claude:session:${sessionId}`;

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
    getStringValue(record.summary) ||
    getStringValue(record.message) ||
    getStringValue(record.text) ||
    getStringValue(record.content);

  const detail =
    getStringValue(record.detail) ||
    getStringValue(record.content) ||
    getStringValue(record.raw);

  const rawActivity = typeof record.activityScore === "number" ? record.activityScore : undefined;
  const activityScore = rawActivity ?? (eventType.startsWith("tool") ? 0.85 : 0.6);

  const event = {
    eventId: makeDeterministicEventId({
      source: "claude",
      entityId,
      timestamp,
      eventType,
      sequence,
      detail: detail || summary
    }),
    timestamp,
    source: "claude",
    sourceHost,
    entityId,
    sessionId,
    parentEntityId: null,
    entityKind: "session" as const,
    displayName: "Claude",
    eventType,
    status: getStringValue(record.status, "active"),
    summary: summary || "Claude activity",
    detail: detail || undefined,
    activityScore: Math.max(0, Math.min(1, activityScore)),
    sequence,
    meta: {
      filePath,
      groupKey: getClaudeProjectKey(filePath),
      toolName: getStringValue(record.toolName) || getStringValue(record.tool_name),
      rawType: getStringValue(record.type)
    }
  };

  return parseNormalizedEvent(event);
}

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
        parseRecord(root.host, filePath, record, sequence, fallbackTimestamp)
    });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new ClaudeWatchPlugin();
}
