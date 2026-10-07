import type { DatabaseSync } from "node:sqlite";

export interface OpenCodeDbSessionRow {
  id: string;
  project_id?: string | null;
  parent_id?: string | null;
  directory?: string | null;
  title?: string | null;
  time_updated: number;
  model?: string | null;
  modelID?: string | null;
  providerID?: string | null;
  lastMessage?: string | null;
  lastTool?: string | null;
  lastToolInput?: string | null;
}

export type OpenCodeDatabase = DatabaseSync;

export const OPEN_CODE_SESSION_TABLES = ["session", "session_v2"] as const;

let databaseSyncModule: Promise<typeof import("node:sqlite")> | undefined;

export async function loadDatabaseSync(): Promise<typeof import("node:sqlite")> {
  databaseSyncModule ??= import("node:sqlite");
  return databaseSyncModule;
}

export async function openOpenCodeDatabase(dbFile: string): Promise<OpenCodeDatabase> {
  const { DatabaseSync: Database } = await loadDatabaseSync();
  return new Database(dbFile, { readOnly: true });
}

function activeSessionsSql(table: (typeof OPEN_CODE_SESSION_TABLES)[number]): string {
  return `SELECT s.id, s.project_id, s.parent_id, s.directory, s.title, s.time_updated, s.model,
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
   FROM ${table} s
   WHERE s.time_updated >= ? AND s.time_archived IS NULL
   ORDER BY s.time_updated DESC`;
}

export function mergeSessionRows(
  rowsByTable: readonly (readonly OpenCodeDbSessionRow[])[]
): OpenCodeDbSessionRow[] {
  const merged = new Map<string, OpenCodeDbSessionRow>();
  for (const rows of rowsByTable) {
    for (const row of rows) {
      const existing = merged.get(row.id);
      if (!existing || row.time_updated > existing.time_updated) {
        merged.set(row.id, row);
      }
    }
  }
  return [...merged.values()];
}

function isMissingTableError(error: unknown): boolean {
  return error instanceof Error && /no such table/i.test(error.message);
}

export function readActiveSessions(db: OpenCodeDatabase, cutoffMs: number): OpenCodeDbSessionRow[] {
  const rowsByTable: OpenCodeDbSessionRow[][] = [];
  for (const table of OPEN_CODE_SESSION_TABLES) {
    try {
      const rows = db.prepare(activeSessionsSql(table)).all(cutoffMs) as unknown as OpenCodeDbSessionRow[];
      rowsByTable.push(rows);
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }
  }
  return mergeSessionRows(rowsByTable);
}
