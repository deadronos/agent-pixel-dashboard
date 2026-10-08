import { DatabaseSync } from "node:sqlite";

import type { OpenCodeDatabase } from "./db.js";

const SESSION_TABLE_SQL = (name: string, modelColumn: boolean): string => `
CREATE TABLE ${name} (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  parent_id TEXT,
  directory TEXT,
  title TEXT,
  ${modelColumn ? "model TEXT," : ""}
  time_updated INTEGER NOT NULL,
  time_archived INTEGER
);`;

export interface FixtureDatabaseOptions {
  filePath?: string;
  tables?: Array<"session" | "session_v2">;
  auxTables?: boolean;
  modelColumn?: boolean;
}

export function createFixtureDatabase(options: FixtureDatabaseOptions = {}): OpenCodeDatabase {
  const db = new DatabaseSync(options.filePath ?? ":memory:");
  for (const table of options.tables ?? ["session", "session_v2"]) {
    db.exec(SESSION_TABLE_SQL(table, options.modelColumn ?? true));
  }
  if (options.auxTables ?? true) {
    db.exec("CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL, data TEXT NOT NULL);");
    db.exec("CREATE TABLE part (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL, data TEXT NOT NULL);");
  }
  return db;
}

export interface FixtureSessionInput {
  id: string;
  time_updated: number;
  time_archived?: number | null;
  directory?: string | null;
  title?: string | null;
  model?: string | null;
}

function hasModelColumn(db: OpenCodeDatabase, table: "session" | "session_v2"): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  return columns.some(column => column.name === "model");
}

export function insertFixtureSession(
  db: OpenCodeDatabase,
  table: "session" | "session_v2",
  row: FixtureSessionInput
): void {
  if (!hasModelColumn(db, table)) {
    db.prepare(
      `INSERT INTO ${table} (id, project_id, parent_id, directory, title, time_updated, time_archived)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(row.id, null, null, row.directory ?? null, row.title ?? null, row.time_updated, row.time_archived ?? null);
    return;
  }
  db.prepare(
    `INSERT INTO ${table} (id, project_id, parent_id, directory, title, model, time_updated, time_archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(row.id, null, null, row.directory ?? null, row.title ?? null, row.model ?? null, row.time_updated, row.time_archived ?? null);
}

export function insertFixtureMessage(
  db: OpenCodeDatabase,
  sessionId: string,
  data: Record<string, unknown>,
  timeCreated: number
): void {
  db.prepare("INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)").run(
    `msg-${sessionId}-${timeCreated}`,
    sessionId,
    timeCreated,
    JSON.stringify(data)
  );
}

export function insertFixturePart(
  db: OpenCodeDatabase,
  sessionId: string,
  data: Record<string, unknown>,
  timeCreated: number
): void {
  db.prepare("INSERT INTO part (id, session_id, time_created, data) VALUES (?, ?, ?, ?)").run(
    `part-${sessionId}-${timeCreated}`,
    sessionId,
    timeCreated,
    JSON.stringify(data)
  );
}
