import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setInterval } from "node:timers";

import { makeDeterministicEventId, parseNormalizedEvent, type NormalizedEvent } from "@agent-watch/event-schema";
import { watch } from "chokidar";

import { isActiveSessionFile } from "./session-detection.js";

import type { DiscoveredSessionRoot, PluginContext, WatchContext, WatchHandle } from "./index.js";

const DEFAULT_WATCH_DEPTH = 6;
const DEFAULT_STABILITY_THRESHOLD_MS = 120;
const DEFAULT_POLL_INTERVAL_MS = 40;

type WatchReason = "add" | "change";

type FileStatLike = {
  size: number;
  mtime: Date;
  mtimeMs: number;
};

/* eslint-disable no-unused-vars */
type ParseRecord<T extends NormalizedEvent> = (
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
) => T;
/* eslint-enable no-unused-vars */

export interface NormalizedSessionParserContext {
  sourceHost: string;
  filePath: string;
  record: Record<string, unknown>;
  sequence: number;
  fallbackTimestamp: string;
}

export interface ResolvedSessionParserContext extends NormalizedSessionParserContext {
  sessionId: string;
  eventType: string;
}

export interface BuildNormalizedSessionEventOptions {
  source: string;
  sourceHost: string;
  filePath: string;
  sessionId?: string;
  entityId: string;
  parentEntityId?: string | null;
  entityKind?: NormalizedEvent["entityKind"];
  displayName: string;
  timestamp?: string;
  eventType?: string;
  status?: unknown;
  summary?: string;
  defaultSummary: string;
  detail?: string;
  activityScore?: number;
  sequence: number;
  meta?: Record<string, unknown>;
}

export interface NormalizedSessionParserConfig {
  source: string;
  defaultDisplayName: string;
  defaultSummary: string;
  /* eslint-disable no-unused-vars */
  getSessionId: (ctx: NormalizedSessionParserContext) => string;
  getEntityId?: (ctx: ResolvedSessionParserContext) => string;
  getDisplayName?: (ctx: ResolvedSessionParserContext) => string;
  getTimestamp?: (ctx: NormalizedSessionParserContext) => string | undefined;
  getEventType?: (ctx: NormalizedSessionParserContext) => string | undefined;
  getStatus?: (ctx: ResolvedSessionParserContext) => unknown;
  getSummary?: (ctx: ResolvedSessionParserContext) => string | undefined;
  getDetail?: (ctx: ResolvedSessionParserContext) => string | undefined;
  getActivityScore?: (ctx: ResolvedSessionParserContext) => number | undefined;
  getMeta?: (ctx: ResolvedSessionParserContext) => Record<string, unknown> | undefined;
  getParentEntityId?: (ctx: ResolvedSessionParserContext) => string | null | undefined;
  getEntityKind?: (ctx: ResolvedSessionParserContext) => NormalizedEvent["entityKind"];
  /* eslint-enable no-unused-vars */
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}

async function getFileStat(filePath: string): Promise<FileStatLike> {
  const stat = await fs.stat(filePath);
  return {
    size: stat.size,
    mtime: stat.mtime,
    mtimeMs: stat.mtimeMs
  };
}

export function expandHomePath(input: string): string {
  if (!input.startsWith("~")) {
    return input;
  }

  return path.join(os.homedir(), input.slice(1));
}

export function getStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function getDefaultActivityScore(eventType: string, rawActivityScore: unknown): number {
  if (typeof rawActivityScore === "number") {
    return Math.max(0, Math.min(1, rawActivityScore));
  }
  return eventType.startsWith("tool") ? 0.85 : 0.6;
}

export function buildNormalizedSessionEvent(options: BuildNormalizedSessionEventOptions): NormalizedEvent {
  const eventType = options.eventType?.trim() || "message";
  const timestamp = options.timestamp?.trim();
  const detail = options.detail?.trim() || undefined;
  const summary = options.summary?.trim() || options.defaultSummary;
  const event = {
    eventId: makeDeterministicEventId({
      source: options.source,
      entityId: options.entityId,
      timestamp: timestamp || new Date(0).toISOString(),
      eventType,
      sequence: options.sequence,
      detail: detail || summary
    }),
    timestamp: timestamp || new Date().toISOString(),
    source: options.source,
    sourceHost: options.sourceHost,
    entityId: options.entityId,
    sessionId: options.sessionId,
    parentEntityId: options.parentEntityId ?? null,
    entityKind: options.entityKind ?? "session",
    displayName: options.displayName,
    eventType,
    status: typeof options.status === "string" ? options.status : "active",
    summary,
    detail,
    activityScore: Math.max(0, Math.min(1, options.activityScore ?? 0.5)),
    sequence: options.sequence,
    meta: options.meta
  };

  return parseNormalizedEvent(event);
}

export function createNormalizedSessionParser(config: NormalizedSessionParserConfig) {
  return (
    sourceHost: string,
    filePath: string,
    record: Record<string, unknown>,
    sequence: number,
    fallbackTimestamp: string
  ): NormalizedEvent => {
    const baseContext: NormalizedSessionParserContext = {
      sourceHost,
      filePath,
      record,
      sequence,
      fallbackTimestamp
    };
    const sessionId = config.getSessionId(baseContext);
    const eventType = config.getEventType?.(baseContext) || "message";
    const resolvedContext: ResolvedSessionParserContext = {
      ...baseContext,
      sessionId,
      eventType
    };

    return buildNormalizedSessionEvent({
      source: config.source,
      sourceHost,
      filePath,
      sessionId,
      entityId: config.getEntityId?.(resolvedContext) ?? `${config.source}:session:${sessionId}`,
      parentEntityId: config.getParentEntityId?.(resolvedContext),
      entityKind: config.getEntityKind?.(resolvedContext) ?? "session",
      displayName: config.getDisplayName?.(resolvedContext) ?? config.defaultDisplayName,
      timestamp: config.getTimestamp?.(baseContext) ?? fallbackTimestamp,
      eventType,
      status: config.getStatus?.(resolvedContext) ?? "active",
      summary: config.getSummary?.(resolvedContext),
      defaultSummary: config.defaultSummary,
      detail: config.getDetail?.(resolvedContext),
      activityScore: config.getActivityScore?.(resolvedContext),
      sequence,
      meta: config.getMeta?.(resolvedContext)
    });
  };
}

export async function discoverSessionRoots(
  config: PluginContext,
  options: {
    envVar: string;
    defaultRoots: string[];
    idPrefix: string;
  }
): Promise<DiscoveredSessionRoot[]> {
  const envRoots = splitCsv(config.env[options.envVar]);
  const configuredRoots = uniqueValues(
    config.configuredRoots.length > 0 || envRoots.length > 0
      ? [...config.configuredRoots, ...envRoots]
      : options.defaultRoots
  );
  const expandedRoots = configuredRoots.map(expandHomePath);
  const discovered: DiscoveredSessionRoot[] = [];

  await Promise.all(
    expandedRoots.map(async (rootPath, index) => {
      try {
        const stat = await fs.stat(rootPath);
        if (!stat.isDirectory()) {
          return;
        }
        discovered.push({
          id: `${options.idPrefix}-${index}`,
          path: path.resolve(rootPath),
          host: config.host
        });
      } catch {
        // Missing roots are expected during local development.
      }
    })
  );

  const filtered = discovered.filter((root) => {
    return !discovered.some(
      (other) => root.path !== other.path && root.path.startsWith(other.path + path.sep)
    );
  });

  return filtered;
}

export interface JsonlIngestState {
  offsets: Map<string, number>;
  sequences: Map<string, number>;
}

export interface JsonFileIngestState {
  mtimes: Map<string, number>;
  sequences: Map<string, number>;
}

export function createJsonlIngestState(): JsonlIngestState {
  return {
    offsets: new Map<string, number>(),
    sequences: new Map<string, number>()
  };
}

export function createJsonFileIngestState(): JsonFileIngestState {
  return {
    mtimes: new Map<string, number>(),
    sequences: new Map<string, number>()
  };
}

export async function ingestJsonlFile<T extends NormalizedEvent>(
  filePath: string,
  state: JsonlIngestState,
  options: {
    reason: WatchReason;
    activeWindowMs?: number;
    stat?: FileStatLike;
    parseRecord: ParseRecord<T>;
    onRecord: WatchContext["onEvent"];
    onError: WatchContext["onError"];
  }
): Promise<void> {
  try {
    const stat = options.stat ?? (await getFileStat(filePath));
    if (!state.offsets.has(filePath) && options.reason === "add" && options.activeWindowMs !== undefined) {
      if (!isActiveSessionFile(stat.mtimeMs, Date.now(), options.activeWindowMs)) {
        state.offsets.set(filePath, stat.size);
        return;
      }
    }

    const previousOffset = state.offsets.get(filePath) ?? 0;
    const nextOffset = stat.size < previousOffset ? 0 : previousOffset;
    const handle = await fs.open(filePath, "r");

    try {
      const length = stat.size - nextOffset;
      if (length <= 0) {
        state.offsets.set(filePath, stat.size);
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

        const sequence = (state.sequences.get(filePath) ?? 0) + 1;
        state.sequences.set(filePath, sequence);

        try {
          const record = options.parseRecord(filePath, parsed, sequence, stat.mtime.toISOString());
          options.onRecord(record);
        } catch (error) {
          options.onError(error as Error);
        }
      }

      state.offsets.set(filePath, stat.size);
    } finally {
      await handle.close();
    }
  } catch (error) {
    options.onError(error as Error);
  }
}

export async function ingestJsonFile<T extends NormalizedEvent>(
  filePath: string,
  state: JsonFileIngestState,
  options: {
    reason: WatchReason;
    activeWindowMs: number;
    parseRecord: ParseRecord<T>;
    onRecord: WatchContext["onEvent"];
    onError: WatchContext["onError"];
  }
): Promise<void> {
  try {
    const stat = await getFileStat(filePath);
    if (!state.mtimes.has(filePath) && options.reason === "add") {
      if (!isActiveSessionFile(stat.mtimeMs, Date.now(), options.activeWindowMs)) {
        state.mtimes.set(filePath, stat.mtimeMs);
        return;
      }
    }

    const previousMtime = state.mtimes.get(filePath);
    if (options.reason === "change" && previousMtime !== undefined && stat.mtimeMs <= previousMtime) {
      return;
    }

    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const sequence = (state.sequences.get(filePath) ?? 0) + 1;
    state.sequences.set(filePath, sequence);
    options.onRecord(options.parseRecord(filePath, parsed, sequence, stat.mtime.toISOString()));
    state.mtimes.set(filePath, stat.mtimeMs);
  } catch (error) {
    options.onError(error as Error);
  }
}

export async function watchJsonlSessionFiles<T extends NormalizedEvent>(
  root: DiscoveredSessionRoot,
  ctx: WatchContext,
  options: {
    // eslint-disable-next-line no-unused-vars
    matchFile: (filePath: string) => boolean;
    activeWindowMs: number;
    parseRecord: ParseRecord<T>;
    depth?: number;
    ignored?: string | RegExp | Array<string | RegExp>;
  }
): Promise<WatchHandle> {
  const state = createJsonlIngestState();
  const watcher = watch(root.path, {
    persistent: true,
    ignoreInitial: false,
    depth: options.depth ?? DEFAULT_WATCH_DEPTH,
    ignored: options.ignored ?? [/(^|[\/\\])\.git([\/\\]|$)/, /(^|[\/\\])node_modules([\/\\]|$)/, /(^|[\/\\])\.next([\/\\]|$)/, /(^|[\/\\])dist([\/\\]|$)/],
    awaitWriteFinish: {
      stabilityThreshold: DEFAULT_STABILITY_THRESHOLD_MS,
      pollInterval: DEFAULT_POLL_INTERVAL_MS
    }
  });

  const ingest = (filePath: string, reason: WatchReason): void => {
    if (!options.matchFile(filePath)) {
      return;
    }

    void ingestJsonlFile(filePath, state, {
      reason,
      activeWindowMs: options.activeWindowMs,
      parseRecord: options.parseRecord,
      onRecord: ctx.onEvent,
      onError: ctx.onError
    });
  };

  watcher.on("add", (filePath) => {
    ingest(filePath, "add");
  });

  watcher.on("change", (filePath) => {
    ingest(filePath, "change");
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

export async function watchJsonSessionFiles<T extends NormalizedEvent>(
  root: DiscoveredSessionRoot,
  ctx: WatchContext,
  options: {
    // eslint-disable-next-line no-unused-vars
    matchFile: (filePath: string) => boolean;
    activeWindowMs: number;
    parseRecord: ParseRecord<T>;
    depth?: number;
    ignored?: string | RegExp | Array<string | RegExp>;
  }
): Promise<WatchHandle> {
  const state = createJsonFileIngestState();
  const watcher = watch(root.path, {
    persistent: true,
    ignoreInitial: false,
    depth: options.depth ?? DEFAULT_WATCH_DEPTH,
    ignored: options.ignored ?? [/(^|[\/\\])\.git([\/\\]|$)/, /(^|[\/\\])node_modules([\/\\]|$)/, /(^|[\/\\])\.next([\/\\]|$)/, /(^|[\/\\])dist([\/\\]|$)/],
    awaitWriteFinish: {
      stabilityThreshold: DEFAULT_STABILITY_THRESHOLD_MS,
      pollInterval: DEFAULT_POLL_INTERVAL_MS
    }
  });

  const ingest = (filePath: string, reason: WatchReason): void => {
    if (!options.matchFile(filePath)) {
      return;
    }

    void ingestJsonFile(filePath, state, {
      reason,
      activeWindowMs: options.activeWindowMs,
      parseRecord: options.parseRecord,
      onRecord: ctx.onEvent,
      onError: ctx.onError
    });
  };

  watcher.on("add", (filePath) => {
    ingest(filePath, "add");
  });

  watcher.on("change", (filePath) => {
    ingest(filePath, "change");
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

export interface CollectFilesOptions {
  maxDepth: number;
  maxFiles: number;
}

export async function collectJsonlFiles(root: string, options: CollectFilesOptions): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string, depth: number): Promise<void> {
    if (results.length >= options.maxFiles) {
      return;
    }

    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= options.maxFiles) {
        return;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
        continue;
      }
      if (entry.isDirectory() && depth < options.maxDepth) {
        await walk(fullPath, depth + 1);
      }
    }
  }

  await walk(root, 0);
  return results;
}

export interface PollingJsonlWatchOptions<T extends NormalizedEvent> {
  // eslint-disable-next-line no-unused-vars
  matchFile: (filePath: string) => boolean;
  activeWindowMs: number;
  parseRecord: ParseRecord<T>;
  scanIntervalMs: number;
  maxDepth: number;
  maxFiles: number;
}

export async function watchJsonlSessionFilesByPolling<T extends NormalizedEvent>(
  root: DiscoveredSessionRoot,
  ctx: WatchContext,
  options: PollingJsonlWatchOptions<T>
): Promise<WatchHandle> {
  const ingestState = createJsonlIngestState();
  const mtimes = new Map<string, number>();
  let closed = false;
  let scanning = false;

  const scan = async (): Promise<void> => {
    if (closed || scanning) {
      return;
    }
    scanning = true;
    try {
      const files = await collectJsonlFiles(root.path, {
        maxDepth: options.maxDepth,
        maxFiles: options.maxFiles
      });
      const live = new Set(files);

      for (const filePath of files) {
        if (!options.matchFile(filePath)) {
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
          mtimes.set(filePath, stat.mtimeMs);
          ingestState.offsets.set(filePath, stat.size);
          continue;
        }

        if (!isActiveSessionFile(stat.mtimeMs, Date.now(), options.activeWindowMs)) {
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
          parseRecord: options.parseRecord,
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
  }, options.scanIntervalMs);

  return {
    close: async () => {
      closed = true;
      clearInterval(timer);
    }
  };
}
