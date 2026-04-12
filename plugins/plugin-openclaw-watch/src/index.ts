import fs from "node:fs/promises";
import { setInterval } from "node:timers";

import { makeDeterministicEventId, parseNormalizedEvent, type NormalizedEvent } from "@agent-watch/event-schema";
import type {
  CollectorPlugin,
  DiscoveredSessionRoot,
  PluginContext,
  WatchContext,
  WatchHandle
} from "@agent-watch/plugin-sdk";
import {
  createJsonlIngestState,
  discoverSessionRoots,
  getStringValue,
  ingestJsonlFile,
  isActiveSessionFile,
  matchesSessionFile,
  type SessionSource
} from "@agent-watch/plugin-sdk";

import { buildOpenClawSessionId, getOpenClawAgentId } from "./identity.js";
import { collectJsonlFiles } from "./polling.js";

const DEFAULT_PATHS = ["~/.openclaw/agents", "~/.openclaw"];
const DEFAULT_SCAN_INTERVAL_MS = 2000;
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_FILES = 5000;
const SOURCE: SessionSource = "openclaw";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function parseRecord(
  sourceHost: string,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
): NormalizedEvent {
  const message =
    record.message && typeof record.message === "object" ? (record.message as Record<string, unknown>) : undefined;
  const agentId = getOpenClawAgentId(filePath);
  const sessionId = buildOpenClawSessionId(agentId, filePath, record);
  const entityId = `openclaw:session:${sessionId}`;

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
    getStringValue(message?.role) ||
    getStringValue(record.summary) ||
    getStringValue(record.message) ||
    getStringValue(record.text) ||
    getStringValue(record.content);

  const detail =
    getStringValue(message?.model) ||
    getStringValue(record.detail) ||
    getStringValue(record.content) ||
    getStringValue(record.raw);

  const rawActivity = typeof record.activityScore === "number" ? record.activityScore : undefined;
  const activityScore = rawActivity ?? (eventType.startsWith("tool") ? 0.85 : 0.6);

  const event = {
    eventId: makeDeterministicEventId({
      source: "openclaw",
      entityId,
      timestamp,
      eventType,
      sequence,
      detail: detail || summary
    }),
    timestamp,
    source: "openclaw",
    sourceHost,
    entityId,
    sessionId,
    parentEntityId: null,
    entityKind: "session" as const,
    displayName: agentId || "OpenClaw",
    eventType,
    status: getStringValue(record.status, "active"),
    summary: summary || "OpenClaw activity",
    detail: detail || undefined,
    activityScore: Math.max(0, Math.min(1, activityScore)),
    sequence,
    meta: {
      filePath,
      agentId: agentId || undefined,
      groupKey: agentId || undefined,
      toolName:
        getStringValue(record.toolName) || getStringValue(record.tool_name) || getStringValue(message?.name),
      rawType: getStringValue(record.type)
    }
  };

  return parseNormalizedEvent(event);
}

export class OpenClawWatchPlugin implements CollectorPlugin {
  id = "plugin-openclaw-watch";
  source = "openclaw";

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    return discoverSessionRoots(config, {
      envVar: "OPENCLAW_SESSION_ROOTS",
      defaultRoots: DEFAULT_PATHS,
      idPrefix: "openclaw-root"
    });
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const ingestState = createJsonlIngestState();
    const mtimes = new Map<string, number>();
    const activeWindowMs = Number(process.env.OPENCLAW_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    const scanIntervalMs = Number(process.env.OPENCLAW_SCAN_INTERVAL_MS ?? DEFAULT_SCAN_INTERVAL_MS);
    const maxDepth = Number(process.env.OPENCLAW_SCAN_MAX_DEPTH ?? DEFAULT_MAX_DEPTH);
    const maxFiles = Number(process.env.OPENCLAW_SCAN_MAX_FILES ?? DEFAULT_MAX_FILES);
    let closed = false;
    let scanning = false;

    const scan = async (): Promise<void> => {
      if (closed || scanning) {
        return;
      }
      scanning = true;
      try {
        const files = await collectJsonlFiles(root.path, {
          maxDepth: Number.isFinite(maxDepth) ? maxDepth : DEFAULT_MAX_DEPTH,
          maxFiles: Number.isFinite(maxFiles) ? maxFiles : DEFAULT_MAX_FILES
        });
        const live = new Set(files);

        for (const filePath of files) {
          if (!MATCH_SESSION_FILE(filePath)) {
            continue;
          }
          let stat;
          try {
            stat = await fs.stat(filePath);
          } catch {
            continue;
          }

          const previousMtime = mtimes.get(filePath);
          const previousOffset = ingestState.offsets.get(filePath);
          if (previousMtime === undefined) {
            // Initial seed avoids replaying old history when starting watcher.
            mtimes.set(filePath, stat.mtimeMs);
            ingestState.offsets.set(filePath, stat.size);
            continue;
          }

          if (!isActiveSessionFile(stat.mtimeMs, Date.now(), activeWindowMs)) {
            mtimes.set(filePath, stat.mtimeMs);
            ingestState.offsets.set(filePath, stat.size);
            continue;
          }

          if (stat.size === previousOffset && stat.mtimeMs <= previousMtime) {
            continue;
          }

          await ingestJsonlFile(filePath, ingestState, {
            reason: "change",
            stat: {
              size: stat.size,
              mtime: stat.mtime,
              mtimeMs: stat.mtimeMs
            },
            parseRecord: (nextFilePath, record, sequence, fallbackTimestamp) =>
              parseRecord(root.host, nextFilePath, record, sequence, fallbackTimestamp),
            onRecord: ctx.onEvent,
            onError: ctx.onError
          });
          mtimes.set(filePath, stat.mtimeMs);
        }

        for (const key of [...mtimes.keys()]) {
          if (!live.has(key)) {
            mtimes.delete(key);
            ingestState.offsets.delete(key);
            ingestState.sequences.delete(key);
          }
        }
      } catch (error) {
        ctx.onError(error as Error);
      } finally {
        scanning = false;
      }
    };

    await scan();
    const timer = setInterval(() => {
      void scan();
    }, Number.isFinite(scanIntervalMs) ? scanIntervalMs : DEFAULT_SCAN_INTERVAL_MS);

    return {
      close: async () => {
        closed = true;
        clearInterval(timer);
      }
    };
  }
}

export default function createPlugin(): CollectorPlugin {
  return new OpenClawWatchPlugin();
}
