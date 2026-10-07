import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { setInterval } from "node:timers";
import { promisify } from "node:util";

import type { CollectorPlugin, DiscoveredSessionRoot, PluginContext, WatchContext, WatchHandle } from "@agent-watch/plugin-sdk";
import { discoverSessionRoots, matchesSessionFile, watchJsonSessionFiles } from "@agent-watch/plugin-sdk";

import type { OpenCodeDbSessionRow } from "./db.js";
import { parseOpenCodeDbEvent, parseOpenCodeSessionFile, SOURCE } from "./parse.js";

export { parseOpenCodeDbEvent, parseOpenCodeSessionFile };

const DEFAULT_DATA_DIR = "~/.local/share/opencode";
const DEFAULT_SCAN_INTERVAL_MS = 2000;
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);
const execFileAsync = promisify(execFile);

async function queryDb(dbFile: string, sql: string, params: string[]): Promise<OpenCodeDbSessionRow[]> {
  try {
    const parts = sql.split("?");
    if (parts.length - 1 !== params.length) {
      throw new Error("Parameter count mismatch");
    }
    let renderedSql = parts[0];
    for (let i = 0; i < params.length; i++) {
      renderedSql += `'${params[i].replace(/'/g, "''")}'` + parts[i + 1];
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
