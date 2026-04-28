import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { setInterval } from "node:timers";
import { promisify } from "node:util";

import type { CollectorPlugin, DiscoveredSessionRoot, PluginContext, WatchContext, WatchHandle } from "@agent-watch/plugin-sdk";
import {
  buildNormalizedSessionEvent,
  discoverSessionRoots,
  getStringValue,
  matchesSessionFile,
  watchJsonSessionFiles,
  type SessionSource
} from "@agent-watch/plugin-sdk";

const SOURCE: SessionSource = "opencode";
const DEFAULT_DATA_DIR = "~/.local/share/opencode";
const DEFAULT_SCAN_INTERVAL_MS = 2000;
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);
const execFileAsync = promisify(execFile);

export interface OpenCodeDbSessionRow {
  id: string;
  project_id?: string | null;
  parent_id?: string | null;
  directory?: string | null;
  title?: string | null;
  time_updated: number;
  modelID?: string | null;
  providerID?: string | null;
  lastMessage?: string | null;
  lastTool?: string | null;
  lastToolInput?: string | null;
}

function getRecordObject(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asIsoTimestamp(value: unknown, fallbackTimestamp: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return fallbackTimestamp;
}

function normalizeModel(model: unknown, provider?: unknown): string | undefined {
  if (typeof model !== "string" || model.trim().length === 0) {
    return undefined;
  }
  if (typeof provider === "string" && provider.trim().length > 0 && !model.includes("/")) {
    return `${provider}/${model}`;
  }
  return model;
}

function projectFromRecord(record: Record<string, unknown>, fallback: string): string {
  const project = getRecordObject(record, "project");
  return getStringValue(project?.path) ||
    getStringValue(record.cwd) ||
    getStringValue(record.path) ||
    getStringValue(record.directory) ||
    fallback;
}

export function parseOpenCodeSessionFile(
  sourceHost: string,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
) {
  const sessionId = getStringValue(record.id) || path.basename(filePath, ".json");
  const project = projectFromRecord(record, path.basename(path.dirname(filePath)));
  const time = getRecordObject(record, "time");
  const model = normalizeModel(record.model);

  return buildNormalizedSessionEvent({
    source: SOURCE,
    sourceHost,
    filePath,
    sessionId,
    entityId: `${SOURCE}:session:${sessionId}`,
    displayName: "OpenCode",
    timestamp: asIsoTimestamp(time?.updated ?? record.updatedAt ?? record.updated, fallbackTimestamp),
    eventType: "session_update",
    summary: getStringValue(record.title) || "OpenCode activity",
    defaultSummary: "OpenCode activity",
    detail: project,
    activityScore: 0.7,
    sequence,
    meta: {
      filePath,
      groupKey: project,
      model
    }
  });
}

export function parseOpenCodeDbEvent(sourceHost: string, row: OpenCodeDbSessionRow, sequence: number) {
  const project = row.directory || row.project_id || row.id;
  const model = normalizeModel(row.modelID, row.providerID);

  return buildNormalizedSessionEvent({
    source: SOURCE,
    sourceHost,
    filePath: `opencode-db:${row.id}`,
    sessionId: row.id,
    entityId: `${SOURCE}:session:${row.id}`,
    parentEntityId: row.parent_id ? `${SOURCE}:session:${row.parent_id}` : null,
    displayName: "OpenCode",
    timestamp: new Date(row.time_updated).toISOString(),
    eventType: "session_update",
    summary: row.lastMessage || row.lastTool || row.title || "OpenCode activity",
    defaultSummary: "OpenCode activity",
    detail: row.lastToolInput || project,
    activityScore: row.lastTool ? 0.85 : 0.75,
    sequence,
    meta: {
      filePath: `opencode-db:${row.id}`,
      groupKey: project,
      model,
      toolName: row.lastTool || undefined
    }
  });
}

async function queryDb(dbFile: string, sql: string, params: string[]): Promise<OpenCodeDbSessionRow[]> {
  try {
    let renderedSql = sql;
    for (const param of params) {
      renderedSql = renderedSql.replace("?", `'${param.replace(/'/g, "''")}'`);
    }
    const { stdout } = await execFileAsync("sqlite3", ["-json", dbFile, renderedSql], { maxBuffer: 10 * 1024 * 1024 });
    return stdout.trim().length > 0 ? JSON.parse(stdout) as OpenCodeDbSessionRow[] : [];
  } catch {
    return [];
  }
}

async function watchOpenCodeDb(root: DiscoveredSessionRoot, ctx: WatchContext, dbFile: string): Promise<WatchHandle> {
  const activeWindowMs = Number(process.env.OPENCODE_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
  const scanIntervalMs = Number(process.env.OPENCODE_SCAN_INTERVAL_MS ?? DEFAULT_SCAN_INTERVAL_MS);
  const seen = new Map<string, number>();
  let closed = false;
  let sequence = 0;

  const scan = async (): Promise<void> => {
    if (closed) {
      return;
    }
    const cutoff = Date.now() - activeWindowMs;
    const rows = await queryDb(
      dbFile,
      `SELECT s.id, s.project_id, s.parent_id, s.directory, s.title, s.time_updated,
        (SELECT json_extract(m.data, '$.modelID') FROM message m WHERE m.session_id = s.id ORDER BY m.time_created DESC LIMIT 1) AS modelID,
        (SELECT json_extract(m.data, '$.providerID') FROM message m WHERE m.session_id = s.id ORDER BY m.time_created DESC LIMIT 1) AS providerID,
        (
          SELECT json_extract(p.data, '$.text')
          FROM part p
          WHERE p.session_id = s.id AND json_extract(p.data, '$.type') = 'text'
          ORDER BY p.time_created DESC
          LIMIT 1
        ) AS lastMessage,
        (
          SELECT COALESCE(json_extract(p.data, '$.tool'), json_extract(p.data, '$.name'), json_extract(p.data, '$.toolName'))
          FROM part p
          WHERE p.session_id = s.id AND json_extract(p.data, '$.type') IN ('tool', 'tool-call', 'tool_use')
          ORDER BY p.time_created DESC
          LIMIT 1
        ) AS lastTool,
        (
          SELECT COALESCE(
            json_extract(p.data, '$.state.input.command'),
            json_extract(p.data, '$.state.input.cmd'),
            json_extract(p.data, '$.state.input.filePath'),
            json_extract(p.data, '$.state.input.file_path'),
            json_extract(p.data, '$.input.command'),
            json_extract(p.data, '$.input.cmd'),
            json_extract(p.data, '$.input.filePath'),
            json_extract(p.data, '$.input.file_path'),
            json_extract(p.data, '$.args.command'),
            json_extract(p.data, '$.arguments.command')
          )
          FROM part p
          WHERE p.session_id = s.id AND json_extract(p.data, '$.type') IN ('tool', 'tool-call', 'tool_use')
          ORDER BY p.time_created DESC
          LIMIT 1
        ) AS lastToolInput
       FROM session s
       WHERE s.time_updated >= ? AND s.time_archived IS NULL
       ORDER BY s.time_updated DESC`,
      [String(cutoff)]
    );
    for (const row of rows) {
      const previous = seen.get(row.id);
      if (previous !== undefined && previous >= row.time_updated) {
        continue;
      }
      seen.set(row.id, row.time_updated);
      try {
        ctx.onEvent(parseOpenCodeDbEvent(root.host, row, ++sequence));
      } catch (error) {
        ctx.onError(error as Error);
      }
    }
  };

  await scan();
  const timer = setInterval(() => {
    void scan().catch((error) => ctx.onError(error as Error));
  }, Number.isFinite(scanIntervalMs) ? scanIntervalMs : DEFAULT_SCAN_INTERVAL_MS);

  return {
    close: async () => {
      closed = true;
      clearInterval(timer);
    }
  };
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
    const activeWindowMs = Number(process.env.OPENCODE_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    const dbFile = path.join(root.path, "opencode.db");
    try {
      await fs.stat(dbFile);
      return watchOpenCodeDb(root, ctx, dbFile);
    } catch {
      return watchJsonSessionFiles(root, ctx, {
        matchFile: MATCH_SESSION_FILE,
        activeWindowMs,
        parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
          parseOpenCodeSessionFile(root.host, filePath, record, sequence, fallbackTimestamp)
      });
    }
  }
}

export default function createPlugin(): CollectorPlugin {
  return new OpenCodeWatchPlugin();
}
