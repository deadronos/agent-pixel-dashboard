import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { NormalizedEvent } from "@agent-watch/event-schema";
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

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
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

export async function discoverSessionRoots(
  config: PluginContext,
  options: {
    envVar: string;
    defaultRoots: string[];
    idPrefix: string;
  }
): Promise<DiscoveredSessionRoot[]> {
  const envRoots = splitCsv(config.env[options.envVar]);
  const configuredRoots =
    config.configuredRoots.length > 0 ? config.configuredRoots : [...envRoots, ...options.defaultRoots];
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
          path: rootPath,
          host: config.host
        });
      } catch {
        // Missing roots are expected during local development.
      }
    })
  );

  return discovered;
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
  }
): Promise<WatchHandle> {
  const state = createJsonlIngestState();
  const watcher = watch(root.path, {
    persistent: true,
    ignoreInitial: false,
    depth: options.depth ?? DEFAULT_WATCH_DEPTH,
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
  }
): Promise<WatchHandle> {
  const state = createJsonFileIngestState();
  const watcher = watch(root.path, {
    persistent: true,
    ignoreInitial: false,
    depth: options.depth ?? DEFAULT_WATCH_DEPTH,
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
