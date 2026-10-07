import fs from "node:fs/promises";
import path from "node:path";
import { setInterval } from "node:timers";

import type { CollectorPlugin, DiscoveredSessionRoot, PluginContext, WatchContext, WatchHandle } from "@agent-watch/plugin-sdk";
import { discoverSessionRoots, matchesSessionFile, watchJsonSessionFiles } from "@agent-watch/plugin-sdk";

import { openOpenCodeDatabase, readActiveSessions, type OpenCodeDatabase } from "./db.js";
import { parseOpenCodeDbEvent, parseOpenCodeSessionFile, SOURCE } from "./parse.js";

const DEFAULT_DATA_DIR = "~/.local/share/opencode";
const DEFAULT_SCAN_INTERVAL_MS = 2000;
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

export interface OpenCodeScanState {
  host: string;
  sequence: number;
  seen: Map<string, number>;
}

export interface OpenCodeScanCallbacks {
  onEvent: WatchContext["onEvent"];
  onError: WatchContext["onError"];
}

export interface OpenCodeScanOptions {
  activeWindowMs: number;
  now?: number;
}

export function scanOpenCodeSessions(
  db: OpenCodeDatabase,
  state: OpenCodeScanState,
  callbacks: OpenCodeScanCallbacks,
  options: OpenCodeScanOptions
): void {
  const cutoff = (options.now ?? Date.now()) - options.activeWindowMs;
  for (const row of readActiveSessions(db, cutoff)) {
    const previous = state.seen.get(row.id);
    if (previous !== undefined && previous >= row.time_updated) {
      continue;
    }
    state.seen.set(row.id, row.time_updated);
    try {
      callbacks.onEvent(parseOpenCodeDbEvent(state.host, row, ++state.sequence));
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface OpenCodeErrorReporter {
  // eslint-disable-next-line no-unused-vars
  report(error: unknown): void;
  reset(): void;
}

export function createOpenCodeErrorReporter(onError: WatchContext["onError"]): OpenCodeErrorReporter {
  let lastMessage: string | undefined;
  return {
    report(error: unknown): void {
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (normalized.message === lastMessage) {
        return;
      }
      lastMessage = normalized.message;
      onError(normalized);
    },
    reset(): void {
      lastMessage = undefined;
    }
  };
}

function resolveActiveWindowMs(): number {
  return Number(process.env.OPENCODE_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
}

function resolveScanIntervalMs(): number {
  const scanIntervalMs = Number(process.env.OPENCODE_SCAN_INTERVAL_MS ?? DEFAULT_SCAN_INTERVAL_MS);
  return Number.isFinite(scanIntervalMs) ? scanIntervalMs : DEFAULT_SCAN_INTERVAL_MS;
}

async function watchOpenCodeDb(root: DiscoveredSessionRoot, ctx: WatchContext, dbFile: string): Promise<WatchHandle> {
  const activeWindowMs = resolveActiveWindowMs();
  const scanIntervalMs = resolveScanIntervalMs();
  const reporter = createOpenCodeErrorReporter(ctx.onError);
  const state: OpenCodeScanState = { host: root.host, sequence: 0, seen: new Map() };
  let database: OpenCodeDatabase | null = await openOpenCodeDatabase(dbFile);
  let closed = false;

  const scan = async (): Promise<void> => {
    if (closed) {
      return;
    }
    if (!database) {
      try {
        database = await openOpenCodeDatabase(dbFile);
      } catch (error) {
        reporter.report(error);
        return;
      }
    }
    try {
      scanOpenCodeSessions(database, state, ctx, { activeWindowMs });
      reporter.reset();
    } catch (error) {
      database.close();
      database = null;
      reporter.report(error);
    }
  };

  await scan();
  const timer = setInterval(() => {
    void scan();
  }, scanIntervalMs);

  return {
    close: async () => {
      closed = true;
      clearInterval(timer);
      database?.close();
      database = null;
    }
  };
}

async function watchJsonFallback(
  root: DiscoveredSessionRoot,
  ctx: WatchContext,
  activeWindowMs: number
): Promise<WatchHandle> {
  return watchJsonSessionFiles(root, ctx, {
    matchFile: MATCH_SESSION_FILE,
    activeWindowMs,
    parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
      parseOpenCodeSessionFile(root.host, filePath, record, sequence, fallbackTimestamp)
  });
}

export class OpenCodeWatchPlugin implements CollectorPlugin {
  id = "plugin-opencode-watch";
  source = SOURCE;

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    return discoverSessionRoots(config, {
      envVar: "OPENCODE_DATA_DIR",
      defaultRoots: [DEFAULT_DATA_DIR],
      idPrefix: "opencode-root"
    });
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const activeWindowMs = resolveActiveWindowMs();
    const dbFile = path.join(root.path, "opencode.db");
    try {
      await fs.stat(dbFile);
    } catch {
      return watchJsonFallback(root, ctx, activeWindowMs);
    }
    try {
      return await watchOpenCodeDb(root, ctx, dbFile);
    } catch (error) {
      ctx.onError(error instanceof Error ? error : new Error(String(error)));
      return watchJsonFallback(root, ctx, activeWindowMs);
    }
  }
}

export default function createPlugin(): CollectorPlugin {
  return new OpenCodeWatchPlugin();
}
