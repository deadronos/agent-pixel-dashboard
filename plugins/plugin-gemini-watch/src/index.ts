import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { watch } from "chokidar";
import { makeDeterministicEventId, parseNormalizedEvent, type NormalizedEvent } from "@agent-watch/event-schema";
import { isActiveSessionFile, matchesSessionFile, type SessionSource } from "@agent-watch/plugin-sdk";
import type {
  CollectorPlugin,
  DiscoveredSessionRoot,
  PluginContext,
  WatchContext,
  WatchHandle
} from "@agent-watch/plugin-sdk";

const DEFAULT_PATHS = ["~/.gemini/tmp", "~/.gemini"];
const SOURCE: SessionSource = "gemini";

function expandHome(input: string): string {
  if (!input.startsWith("~")) {
    return input;
  }
  return path.join(os.homedir(), input.slice(1));
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function parseGeminiSessionFile(
  sourceHost: string,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
): NormalizedEvent {
  const sessionId =
    getString(record.sessionId) ||
    path.basename(filePath).replace(/^session-/, "").replace(/\.json$/, "");
  const entityId = `gemini:session:${sessionId}`;
  const messages = Array.isArray(record.messages) ? (record.messages as Array<Record<string, unknown>>) : [];
  const lastMessage = messages.at(-1) ?? {};
  const lastToolCall =
    [...messages].reverse().find((message) => Array.isArray(message.toolCalls) && message.toolCalls.length > 0) ?? null;

  const timestamp =
    getString(record.timestamp) ||
    getString(record.created_at) ||
    getString(record.createdAt) ||
    fallbackTimestamp;

  const eventType =
    getString(lastMessage.type) ||
    "message";

  const summary =
    getString(lastMessage.content) ||
    getString(record.summary) ||
    "Gemini activity";

  const detail =
    getString(record.projectHash) ||
    getString(record.cwd);

  const rawActivity = typeof record.activityScore === "number" ? record.activityScore : undefined;
  const activityScore = rawActivity ?? (eventType.startsWith("tool") ? 0.85 : 0.6);
  const model =
    getString(lastMessage.model) ||
    getString(
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
    status: getString(record.status, "active"),
    summary: summary || "Gemini activity",
    detail: detail || undefined,
    activityScore: Math.max(0, Math.min(1, activityScore)),
    sequence,
    meta: {
      filePath,
      groupKey: detail || undefined,
      toolName:
        lastToolCall && Array.isArray(lastToolCall.toolCalls)
          ? getString((lastToolCall.toolCalls[0] as Record<string, unknown>)?.name)
          : undefined,
      rawType: getString(lastMessage.type),
      model: model || undefined
    }
  };

  return parseNormalizedEvent(event);
}

export class GeminiWatchPlugin implements CollectorPlugin {
  id = "plugin-gemini-watch";
  source = "gemini";

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    const envRoots = (config.env.GEMINI_SESSION_ROOTS ?? "")
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
          discovered.push({ id: `gemini-root-${index}`, path: rootPath, host: config.host });
        } catch {
          // ignore missing roots
        }
      })
    );

    return discovered;
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const activeWindowMs = Number(process.env.GEMINI_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    const mtimes = new Map<string, number>();
    const sequences = new Map<string, number>();

    const ingestFile = async (filePath: string, reason: "add" | "change"): Promise<void> => {
      if (!matchesSessionFile(SOURCE, filePath)) {
        return;
      }

      try {
        const stat = await fs.stat(filePath);
        if (!mtimes.has(filePath) && reason === "add") {
          if (!isActiveSessionFile(stat.mtimeMs, Date.now(), activeWindowMs)) {
            mtimes.set(filePath, stat.mtimeMs);
            return;
          }
        }
        const previousMtime = mtimes.get(filePath);
        if (reason === "change" && previousMtime !== undefined && stat.mtimeMs <= previousMtime) {
          return;
        }

        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const sequence = (sequences.get(filePath) ?? 0) + 1;
        sequences.set(filePath, sequence);
        const event = parseGeminiSessionFile(root.host, filePath, parsed, sequence, stat.mtime.toISOString());
        ctx.onEvent(event);
        mtimes.set(filePath, stat.mtimeMs);
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
  return new GeminiWatchPlugin();
}
