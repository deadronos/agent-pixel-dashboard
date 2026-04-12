import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { makeDeterministicEventId, parseNormalizedEvent, type NormalizedEvent } from "@agent-watch/event-schema";
import { isActiveSessionFile, matchesSessionFile, type SessionSource } from "@agent-watch/plugin-sdk";
import type {
  CollectorPlugin,
  DiscoveredSessionRoot,
  PluginContext,
  WatchContext,
  WatchHandle
} from "@agent-watch/plugin-sdk";
import { watch } from "chokidar";

const DEFAULT_PATHS = ["~/.claude/projects", "~/.claude"];
const SOURCE: SessionSource = "claude";

function expandHome(input: string): string {
  if (!input.startsWith("~")) {
    return input;
  }
  return path.join(os.homedir(), input.slice(1));
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

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
    getString(record.session_id) ||
    getString(record.sessionId) ||
    getString(record.conversation_id) ||
    path.basename(filePath).replace(/\.jsonl$/, "");
  const entityId = `claude:session:${sessionId}`;

  const timestamp =
    getString(record.timestamp) ||
    getString(record.created_at) ||
    getString(record.createdAt) ||
    fallbackTimestamp;

  const eventType =
    getString(record.event_type) ||
    getString(record.type) ||
    "message";

  const summary =
    getString(record.summary) ||
    getString(record.message) ||
    getString(record.text) ||
    getString(record.content);

  const detail =
    getString(record.detail) ||
    getString(record.content) ||
    getString(record.raw);

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
    status: getString(record.status, "active"),
    summary: summary || "Claude activity",
    detail: detail || undefined,
    activityScore: Math.max(0, Math.min(1, activityScore)),
    sequence,
    meta: {
      filePath,
      groupKey: getClaudeProjectKey(filePath),
      toolName: getString(record.toolName) || getString(record.tool_name),
      rawType: getString(record.type)
    }
  };

  return parseNormalizedEvent(event);
}

export class ClaudeWatchPlugin implements CollectorPlugin {
  id = "plugin-claude-watch";
  source = "claude";

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    const envRoots = (config.env.CLAUDE_SESSION_ROOTS ?? "")
      .split(",")
      .map((value: string) => value.trim())
      .filter(Boolean);

    const configured = config.configuredRoots.length > 0 ? config.configuredRoots : [...envRoots, ...DEFAULT_PATHS];
    const roots = configured.map(expandHome);
    const discovered: DiscoveredSessionRoot[] = [];

    await Promise.all(
      roots.map(async (rootPath: string, index: number) => {
        try {
          const stat = await fs.stat(rootPath);
          if (!stat.isDirectory()) {
            return;
          }
          discovered.push({ id: `claude-root-${index}`, path: rootPath, host: config.host });
        } catch {
          // ignore missing roots
        }
      })
    );

    return discovered;
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const activeWindowMs = Number(process.env.CLAUDE_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    const offsets = new Map<string, number>();
    const sequences = new Map<string, number>();

    const ingestFile = async (filePath: string, reason: "add" | "change"): Promise<void> => {
      if (!matchesSessionFile(SOURCE, filePath)) {
        return;
      }

      try {
        const stat = await fs.stat(filePath);
        if (!offsets.has(filePath) && reason === "add") {
          if (!isActiveSessionFile(stat.mtimeMs, Date.now(), activeWindowMs)) {
            offsets.set(filePath, stat.size);
            return;
          }
        }
        const previousOffset = offsets.get(filePath) ?? 0;
        const nextOffset = stat.size < previousOffset ? 0 : previousOffset;

        const handle = await fs.open(filePath, "r");
        try {
          const length = stat.size - nextOffset;
          if (length <= 0) {
            offsets.set(filePath, stat.size);
            return;
          }

          const buffer = Buffer.alloc(length);
          await handle.read(buffer, 0, length, nextOffset);
          const text = buffer.toString("utf8");
          const lines = text.split("\n").filter((line) => line.trim().length > 0);

          for (const line of lines) {
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(line) as Record<string, unknown>;
            } catch {
              continue;
            }

            const sequence = (sequences.get(filePath) ?? 0) + 1;
            sequences.set(filePath, sequence);

            try {
              const event = parseRecord(root.host, filePath, parsed, sequence, stat.mtime.toISOString());
              ctx.onEvent(event);
            } catch (error) {
              ctx.onError(error as Error);
            }
          }

          offsets.set(filePath, stat.size);
        } finally {
          await handle.close();
        }
      } catch (error) {
        ctx.onError(error as Error);
      }
    };

    const watcher = watch(root.path, {
      persistent: true,
      ignoreInitial: false,
      depth: 6,
      awaitWriteFinish: {
        stabilityThreshold: 120,
        pollInterval: 40
      }
    });

    watcher.on("add", (filePath) => {
      void ingestFile(filePath, "add");
    });

    watcher.on("change", (filePath) => {
      void ingestFile(filePath, "change");
    });

    watcher.on("error", (error) => {
      ctx.onError(error as Error);
    });

    return {
      close: async () => {
        await watcher.close();
      }
    };
  }
}

export default function createPlugin(): CollectorPlugin {
  return new ClaudeWatchPlugin();
}
