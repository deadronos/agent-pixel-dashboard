# OpenCode Adapter Current-Storage Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `plugin-opencode-watch` read live OpenCode sessions from both `session` and `session_v2` tables using Node's built-in `node:sqlite`, surface errors instead of swallowing them, and keep the legacy JSON fallback.

**Architecture:** Split the plugin into `db.ts` (driver + union query + merge), `parse.ts` (event builders + model parsing), and `index.ts` (plugin, scan unit, error throttling, watch wiring). Read both tables per poll, merge by session id keeping the freshest `time_updated`, emit only on advance.

**Tech Stack:** TypeScript (ESM, `.js` import suffixes), `node:sqlite` (`DatabaseSync`, read-only), Vitest, npm workspaces. Spec: `docs/superpowers/specs/2026-10-08-opencode-adapter-v2-storage-design.md`.

## Global Constraints

- Runtime floor: `node:sqlite` requires Node >= 22.5. Dev environment is Node 24.21.
- Production code must load `node:sqlite` lazily via `loadDatabaseSync()`; only tests may import it statically.
- No new dependencies. Do not use the `sqlite3` CLI anywhere.
- Keep ESM imports with explicit `.js` extensions (repo convention).
- Do not change the emitted `NormalizedEvent` shape or any other package/plugin.
- Tests live beside sources as `src/*.test.ts` and run with Vitest.
- Commit after every task with a conventional commit message.
- Final verification: `npm ci`, then `npm run build`, `npm run lint`, `npm run test` from the repo root.

---

### Task 1: SQLite driver, union query, and merge

**Files:**
- Create: `plugins/plugin-opencode-watch/src/db.ts`
- Create: `plugins/plugin-opencode-watch/src/test-utils.ts`
- Test: `plugins/plugin-opencode-watch/src/db.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `interface OpenCodeDbSessionRow` (with `model?: string | null` added)
  - `type OpenCodeDatabase = DatabaseSync`
  - `loadDatabaseSync(): Promise<typeof import("node:sqlite")>`
  - `openOpenCodeDatabase(dbFile: string): Promise<OpenCodeDatabase>`
  - `readActiveSessions(db: OpenCodeDatabase, cutoffMs: number): OpenCodeDbSessionRow[]`
  - `mergeSessionRows(rowsByTable: readonly (readonly OpenCodeDbSessionRow[])[]): OpenCodeDbSessionRow[]`
  - Test helpers in `test-utils.ts`: `createFixtureDatabase(options?)`, `insertFixtureSession(db, table, row)`, `insertFixtureMessage(db, sessionId, data, timeCreated)`, `insertFixturePart(db, sessionId, data, timeCreated)`

- [ ] **Step 1: Create fixture helpers (test support)**

Create `plugins/plugin-opencode-watch/src/test-utils.ts`:

```typescript
import { DatabaseSync } from "node:sqlite";

import type { OpenCodeDatabase } from "./db.js";

const SESSION_TABLE_SQL = (name: string): string => `
CREATE TABLE ${name} (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  parent_id TEXT,
  directory TEXT,
  title TEXT,
  model TEXT,
  time_updated INTEGER NOT NULL,
  time_archived INTEGER
);`;

export interface FixtureDatabaseOptions {
  filePath?: string;
  tables?: Array<"session" | "session_v2">;
}

export function createFixtureDatabase(options: FixtureDatabaseOptions = {}): OpenCodeDatabase {
  const db = new DatabaseSync(options.filePath ?? ":memory:");
  for (const table of options.tables ?? ["session", "session_v2"]) {
    db.exec(SESSION_TABLE_SQL(table));
  }
  db.exec("CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL, data TEXT NOT NULL);");
  db.exec("CREATE TABLE part (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL, data TEXT NOT NULL);");
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

export function insertFixtureSession(
  db: OpenCodeDatabase,
  table: "session" | "session_v2",
  row: FixtureSessionInput
): void {
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
```

- [ ] **Step 2: Write the failing tests**

Create `plugins/plugin-opencode-watch/src/db.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { mergeSessionRows, readActiveSessions, type OpenCodeDbSessionRow } from "./db.js";
import { createFixtureDatabase, insertFixtureMessage, insertFixturePart, insertFixtureSession } from "./test-utils.js";

describe("mergeSessionRows", () => {
  it("keeps the freshest row per session id across tables", () => {
    const older: OpenCodeDbSessionRow = { id: "ses_a", time_updated: 1000, directory: "/old" };
    const newer: OpenCodeDbSessionRow = { id: "ses_a", time_updated: 2000, directory: "/new" };
    const v2Only: OpenCodeDbSessionRow = { id: "ses_b", time_updated: 1500 };

    expect(mergeSessionRows([[older], [newer, v2Only]])).toEqual([newer, v2Only]);
  });
});

describe("readActiveSessions", () => {
  it("unions session and session_v2, preferring the freshest row and excluding archived/stale rows", () => {
    const db = createFixtureDatabase();
    insertFixtureSession(db, "session", { id: "ses_shared", time_updated: 1000, directory: "/old" });
    insertFixtureSession(db, "session_v2", { id: "ses_shared", time_updated: 2000, directory: "/new" });
    insertFixtureSession(db, "session_v2", { id: "ses_v2only", time_updated: 1500, title: "V2 only" });
    insertFixtureSession(db, "session", { id: "ses_archived", time_updated: 1800, time_archived: 1900 });
    insertFixtureSession(db, "session", { id: "ses_stale", time_updated: 100 });

    const rows = readActiveSessions(db, 500);
    expect(rows.map(row => row.id).sort()).toEqual(["ses_shared", "ses_v2only"]);
    expect(rows.find(row => row.id === "ses_shared")).toMatchObject({ time_updated: 2000, directory: "/new" });
  });

  it("resolves message and part subqueries", () => {
    const db = createFixtureDatabase();
    insertFixtureSession(db, "session_v2", { id: "ses_live", time_updated: 1000 });
    insertFixtureMessage(db, "ses_live", { role: "assistant", modelID: "kimi-k2.6", providerID: "moonshotai" }, 1000);
    insertFixturePart(db, "ses_live", { type: "tool", tool: "bash", state: { input: { command: "npm test" } } }, 1000);
    insertFixturePart(db, "ses_live", { type: "text", text: "Tests are green" }, 1100);

    const row = readActiveSessions(db, 500).find(candidate => candidate.id === "ses_live");
    expect(row).toMatchObject({
      modelID: "kimi-k2.6",
      providerID: "moonshotai",
      lastMessage: "Tests are green",
      lastTool: "bash",
      lastToolInput: "npm test"
    });
  });

  it("reads legacy databases that only have the session table", () => {
    const db = createFixtureDatabase({ tables: ["session"] });
    insertFixtureSession(db, "session", { id: "ses_legacy", time_updated: 1000 });

    expect(readActiveSessions(db, 500).map(row => row.id)).toEqual(["ses_legacy"]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm --workspace @agent-watch/plugin-opencode-watch test -- src/db.test.ts`
Expected: FAIL — cannot resolve `./db.js` (module does not exist).

- [ ] **Step 4: Implement `db.ts`**

Create `plugins/plugin-opencode-watch/src/db.ts`:

```typescript
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --workspace @agent-watch/plugin-opencode-watch test -- src/db.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Build and lint the workspace**

Run: `npm --workspace @agent-watch/plugin-opencode-watch run build && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add plugins/plugin-opencode-watch/src/db.ts plugins/plugin-opencode-watch/src/db.test.ts plugins/plugin-opencode-watch/src/test-utils.ts
git commit -m "feat(plugin-opencode-watch): add sqlite driver and union session query"
```

---

### Task 2: Extract parsers and prefer `session.model`

**Files:**
- Create: `plugins/plugin-opencode-watch/src/parse.ts`
- Create: `plugins/plugin-opencode-watch/src/parse.test.ts`
- Modify: `plugins/plugin-opencode-watch/src/index.ts` (remove moved code, import/re-export from `parse.js`)

**Interfaces:**
- Consumes: `OpenCodeDbSessionRow` from `./db.js` (Task 1).
- Produces:
  - `SOURCE: SessionSource` (`"opencode"`)
  - `normalizeModel(model: unknown, provider?: unknown): string | undefined`
  - `parseSessionModel(modelJson, fallbackModel, fallbackProvider): string | undefined`
  - `parseOpenCodeSessionFile(sourceHost, filePath, record, sequence, fallbackTimestamp)` (unchanged behavior)
  - `parseOpenCodeDbEvent(sourceHost, row: OpenCodeDbSessionRow, sequence)` (now prefers `row.model` JSON)

- [ ] **Step 1: Write the failing tests**

Create `plugins/plugin-opencode-watch/src/parse.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { parseOpenCodeDbEvent, parseOpenCodeSessionFile, parseSessionModel } from "./parse.js";

describe("parseOpenCodeSessionFile", () => {
  it("normalizes OpenCode JSON fallback sessions into shared events", () => {
    const event = parseOpenCodeSessionFile(
      "workstation",
      "/Users/test/.local/share/opencode/storage/session/work/session-1.json",
      {
        id: "session-1",
        title: "Fix dashboard",
        project: { path: "/workspace/demo" },
        model: "anthropic/claude-sonnet-4-5",
        time: { updated: 1_800_000_000_000 }
      },
      1,
      "2026-04-09T20:15:31.000Z"
    );

    expect(event).toMatchObject({
      source: "opencode",
      sourceHost: "workstation",
      entityId: "opencode:session:session-1",
      sessionId: "session-1",
      displayName: "OpenCode",
      eventType: "session_update",
      summary: "Fix dashboard",
      detail: "/workspace/demo"
    });
    expect(event.meta).toMatchObject({
      filePath: "/Users/test/.local/share/opencode/storage/session/work/session-1.json",
      groupKey: "/workspace/demo",
      model: "anthropic/claude-sonnet-4-5"
    });
  });
});

describe("parseSessionModel", () => {
  it("prefers the session.model JSON column", () => {
    expect(
      parseSessionModel('{"id":"deepseek-v4.1-flash","providerID":"opencode-go","variant":"max"}', "fallback", "fallback-provider")
    ).toBe("opencode-go/deepseek-v4.1-flash");
  });

  it("falls back to message-derived model metadata when model is null", () => {
    expect(parseSessionModel(null, "kimi-k2.6", "moonshotai")).toBe("moonshotai/kimi-k2.6");
  });

  it("falls back when the model JSON is invalid", () => {
    expect(parseSessionModel("{not json", "kimi-k2.6", "moonshotai")).toBe("moonshotai/kimi-k2.6");
  });

  it("falls back to provider-less message metadata when the model JSON id is empty", () => {
    expect(parseSessionModel('{"providerID":"opencode-go"}', "kimi-k2.6", undefined)).toBe("kimi-k2.6");
  });

  it("keeps provider-qualified ids untouched", () => {
    expect(parseSessionModel(undefined, "anthropic/claude-sonnet-4-5", "anthropic")).toBe("anthropic/claude-sonnet-4-5");
  });
});

describe("parseOpenCodeDbEvent", () => {
  it("normalizes OpenCode SQLite session rows into shared events", () => {
    const event = parseOpenCodeDbEvent(
      "workstation",
      {
        id: "ses_live",
        directory: "/workspace/live",
        project_id: "project_live",
        parent_id: null,
        title: "Live OpenCode",
        time_updated: 1_800_000_000_000,
        model: '{"id":"deepseek-v4.1-flash","providerID":"opencode-go","variant":"max"}',
        lastMessage: "Tests are green",
        lastTool: "bash",
        lastToolInput: "npm test"
      },
      2
    );

    expect(event).toMatchObject({
      source: "opencode",
      entityId: "opencode:session:ses_live",
      sessionId: "ses_live",
      eventType: "session_update",
      summary: "Tests are green",
      detail: "npm test"
    });
    expect(event.meta).toMatchObject({
      filePath: "opencode-db:ses_live",
      groupKey: "/workspace/live",
      model: "opencode-go/deepseek-v4.1-flash",
      toolName: "bash"
    });
  });

  it("falls back to message model metadata when session.model is null", () => {
    const event = parseOpenCodeDbEvent(
      "workstation",
      {
        id: "ses_fallback",
        directory: "/workspace/live",
        time_updated: 1_800_000_000_000,
        model: null,
        modelID: "kimi-k2.6",
        providerID: "moonshotai"
      },
      3
    );

    expect(event.meta).toMatchObject({ model: "moonshotai/kimi-k2.6" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace @agent-watch/plugin-opencode-watch test -- src/parse.test.ts`
Expected: FAIL — cannot resolve `./parse.js`.

- [ ] **Step 3: Implement `parse.ts`**

Create `plugins/plugin-opencode-watch/src/parse.ts` (existing logic moved from `index.ts`, plus `parseSessionModel`):

```typescript
import path from "node:path";

import { buildNormalizedSessionEvent, getStringValue, type SessionSource } from "@agent-watch/plugin-sdk";

import type { OpenCodeDbSessionRow } from "./db.js";

export const SOURCE: SessionSource = "opencode";

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

export function normalizeModel(model: unknown, provider?: unknown): string | undefined {
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

export function parseSessionModel(
  modelJson: string | null | undefined,
  fallbackModel: string | null | undefined,
  fallbackProvider: string | null | undefined
): string | undefined {
  if (typeof modelJson === "string" && modelJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(modelJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const model = normalizeModel(record.id, record.providerID);
        if (model) {
          return model;
        }
      }
    } catch {
      // Invalid JSON falls back to message-derived model metadata.
    }
  }
  return normalizeModel(fallbackModel ?? undefined, fallbackProvider ?? undefined);
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
  const model = parseSessionModel(row.model, row.modelID, row.providerID);

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
```

- [ ] **Step 4: Update `index.ts` to use the extracted parsers**

Replace the entire contents of `plugins/plugin-opencode-watch/src/index.ts` with the version below. This deletes the moved parsing code and the now-duplicated `OpenCodeDbSessionRow` interface while keeping the existing (CLI-based) watch loop unchanged for this task:

```typescript
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
```

- [ ] **Step 5: Run the workspace tests to verify everything passes**

Run: `npm --workspace @agent-watch/plugin-opencode-watch test`
Expected: PASS — new `parse.test.ts` plus the unchanged `index.test.ts` (which still imports the re-exported parsers).

- [ ] **Step 6: Build and lint**

Run: `npm --workspace @agent-watch/plugin-opencode-watch run build && npm run lint`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add plugins/plugin-opencode-watch/src/parse.ts plugins/plugin-opencode-watch/src/parse.test.ts plugins/plugin-opencode-watch/src/index.ts
git commit -m "refactor(plugin-opencode-watch): extract parsers and prefer session.model"
```

---

### Task 3: Replace the CLI watcher with `node:sqlite` scan + error throttling

**Files:**
- Modify: `plugins/plugin-opencode-watch/src/index.ts` (full rewrite below)
- Test: `plugins/plugin-opencode-watch/src/index.test.ts` (replace contents)

**Interfaces:**
- Consumes: `openOpenCodeDatabase`, `readActiveSessions`, `OpenCodeDatabase` from `./db.js` (Task 1); `parseOpenCodeDbEvent`, `parseOpenCodeSessionFile`, `SOURCE` from `./parse.js` (Task 2); test helpers from `./test-utils.js` (Task 1).
- Produces:
  - `interface OpenCodeScanState { host: string; sequence: number; seen: Map<string, number> }`
  - `scanOpenCodeSessions(db, state, callbacks, options): void`
  - `createOpenCodeErrorReporter(onError): { report(error): void; reset(): void }`
  - `OpenCodeWatchPlugin.watch()` now uses the DB path via `node:sqlite` and falls back to JSON.

- [ ] **Step 1: Replace `index.test.ts` with the failing tests**

Replace the entire contents of `plugins/plugin-opencode-watch/src/index.test.ts`:

```typescript
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { NormalizedEvent } from "@agent-watch/event-schema";

import { createOpenCodeErrorReporter, OpenCodeWatchPlugin, scanOpenCodeSessions, type OpenCodeScanState } from "./index.js";
import { createFixtureDatabase, insertFixtureSession } from "./test-utils.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

function createScanHarness(): { events: NormalizedEvent[]; errors: Error[]; state: OpenCodeScanState } {
  return {
    events: [],
    errors: [],
    state: { host: "workstation", sequence: 0, seen: new Map() }
  };
}

describe("scanOpenCodeSessions", () => {
  it("emits v2-only sessions and dedupes unchanged rows", async () => {
    const db = createFixtureDatabase();
    insertFixtureSession(db, "session_v2", { id: "ses_v2", time_updated: 1000, directory: "/workspace/v2", title: "V2 session" });
    const { events, errors, state } = createScanHarness();
    const callbacks = { onEvent: (event: NormalizedEvent) => events.push(event), onError: (error: Error) => errors.push(error) };

    scanOpenCodeSessions(db, state, callbacks, { activeWindowMs: 500, now: 1500 });
    expect(errors).toEqual([]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: "opencode",
      entityId: "opencode:session:ses_v2",
      sessionId: "ses_v2",
      summary: "V2 session"
    });

    scanOpenCodeSessions(db, state, callbacks, { activeWindowMs: 500, now: 1500 });
    expect(events).toHaveLength(1);

    db.prepare("UPDATE session_v2 SET time_updated = 2000 WHERE id = 'ses_v2'").run();
    scanOpenCodeSessions(db, state, callbacks, { activeWindowMs: 500, now: 2500 });
    expect(events).toHaveLength(2);
  });

  it("reads legacy session tables without a session_v2 table", () => {
    const db = createFixtureDatabase({ tables: ["session"] });
    insertFixtureSession(db, "session", { id: "ses_legacy", time_updated: 1000 });
    const { events, state } = createScanHarness();

    scanOpenCodeSessions(db, state, { onEvent: event => events.push(event), onError: () => {} }, { activeWindowMs: 500, now: 1500 });
    expect(events).toHaveLength(1);
  });
});

describe("createOpenCodeErrorReporter", () => {
  it("throttles duplicate messages and resets after success", () => {
    const seen: string[] = [];
    const reporter = createOpenCodeErrorReporter(error => seen.push(error.message));

    reporter.report(new Error("boom"));
    reporter.report(new Error("boom"));
    expect(seen).toEqual(["boom"]);

    reporter.report(new Error("different"));
    expect(seen).toEqual(["boom", "different"]);

    reporter.reset();
    reporter.report(new Error("boom"));
    expect(seen).toEqual(["boom", "different", "boom"]);
  });
});

describe("OpenCodeWatchPlugin.watch", () => {
  it("watches both session tables when opencode.db exists", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-watch-"));
    tempDirs.push(dir);
    const dbFile = path.join(dir, "opencode.db");
    const setup = createFixtureDatabase({ filePath: dbFile });
    insertFixtureSession(setup, "session_v2", { id: "ses_live", time_updated: Date.now(), title: "Live" });
    setup.close();

    const events: NormalizedEvent[] = [];
    const plugin = new OpenCodeWatchPlugin();
    const handle = await plugin.watch(
      { id: "root", path: dir, host: "workstation" },
      { onEvent: event => events.push(event), onError: () => {} }
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ entityId: "opencode:session:ses_live" });
    await handle.close();
  });

  it("falls back to json watching when there is no database", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-watch-"));
    tempDirs.push(dir);

    const plugin = new OpenCodeWatchPlugin();
    const handle = await plugin.watch(
      { id: "root", path: dir, host: "workstation" },
      { onEvent: () => {}, onError: () => {} }
    );

    expect(handle).toBeDefined();
    await handle.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --workspace @agent-watch/plugin-opencode-watch test -- src/index.test.ts`
Expected: FAIL — `scanOpenCodeSessions`/`createOpenCodeErrorReporter` are not exported.

- [ ] **Step 3: Rewrite `index.ts`**

Replace the entire contents of `plugins/plugin-opencode-watch/src/index.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --workspace @agent-watch/plugin-opencode-watch test`
Expected: PASS — `db.test.ts`, `parse.test.ts`, `index.test.ts` all green (no CLI-based code remains).

- [ ] **Step 5: Build and lint**

Run: `npm --workspace @agent-watch/plugin-opencode-watch run build && npm run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add plugins/plugin-opencode-watch/src/index.ts plugins/plugin-opencode-watch/src/index.test.ts
git commit -m "feat(plugin-opencode-watch): watch session and session_v2 via node:sqlite"
```

---

### Task 4: Runtime declaration, docs, and end-to-end verification

**Files:**
- Modify: `plugins/plugin-opencode-watch/package.json`
- Modify: `README.md:13`

**Interfaces:**
- Consumes: the complete plugin from Tasks 1-3.
- Produces: declared Node floor and documentation; no code interfaces.

- [ ] **Step 1: Declare the Node floor**

In `plugins/plugin-opencode-watch/package.json`, add an `engines` field after `"types"`:

```json
{
  "name": "@agent-watch/plugin-opencode-watch",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "engines": {
    "node": ">=22.5"
  },
  "scripts": {
```

- [ ] **Step 2: Update the README bullet**

Change line 13 of `README.md` from:

```markdown
- `plugins/plugin-opencode-watch`: OpenCode watcher plugin, preferring live SQLite state with JSON fallback
```

to:

```markdown
- `plugins/plugin-opencode-watch`: OpenCode watcher plugin, preferring live SQLite state (`session` + `session_v2` via built-in `node:sqlite`, Node >= 22.5) with legacy JSON fallback
```

- [ ] **Step 3: Run the full suite on a clean install**

```bash
npm ci
npm run build
npm run lint
npm run test
```

Expected: every command exits 0; Vitest reports no failures.

- [ ] **Step 4: Live-database acceptance check**

With built output, confirm the adapter now sees `session_v2`-only sessions (compare against the raw SQL union):

```bash
node --input-type=module -e "
import { openOpenCodeDatabase, readActiveSessions } from './plugins/plugin-opencode-watch/dist/db.js';
const dbFile = process.env.HOME + '/.local/share/opencode/opencode.db';
const db = await openOpenCodeDatabase(dbFile);
const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
const rows = readActiveSessions(db, cutoff);
console.log('merged active sessions:', rows.length);
console.log('sample:', rows.slice(0, 3).map(row => row.id + ' -> ' + (row.model ?? 'no-model')).join('\n'));
db.close();
"

sqlite3 ~/.local/share/opencode/opencode.db "
SELECT COUNT(*) FROM (
  SELECT id FROM session WHERE time_updated >= (strftime('%s','now')*1000 - 604800000) AND time_archived IS NULL
  UNION
  SELECT id FROM session_v2 WHERE time_updated >= (strftime('%s','now')*1000 - 604800000) AND time_archived IS NULL
);"
```

Expected: both queries report the same count, and the sample includes at least one session id that only exists in `session_v2` (verify with `SELECT id FROM session_v2 WHERE id = '<sample id>';` returning a row while the same id is absent from `session`).

- [ ] **Step 5: Commit**

```bash
git add plugins/plugin-opencode-watch/package.json README.md
git commit -m "docs(plugin-opencode-watch): note node 22.5 floor and current storage support"
```

---

## Self-Review Notes

- Spec coverage: driver (`Task 1`), union/merge (`Task 1`), model preference (`Task 2`), error throttling and JSON fallback (`Task 3`), file split (`Tasks 1-3`), engines/README (`Task 4`), testing strategy (`Tasks 1-3`).
- Missing-table guard (`isMissingTableError`) added during planning so legacy databases without `session_v2` keep working; covered by a test.
- Type consistency: `OpenCodeDbSessionRow`, `OpenCodeDatabase`, `OpenCodeScanState`, `scanOpenCodeSessions`, and `createOpenCodeErrorReporter` use identical names/signatures across tasks and tests.
