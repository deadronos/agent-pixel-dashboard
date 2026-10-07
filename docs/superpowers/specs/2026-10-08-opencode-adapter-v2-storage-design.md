# OpenCode Adapter: Current Storage Support (`session_v2` + built-in SQLite) Design

## Problem Statement

`plugins/plugin-opencode-watch` reads OpenCode session activity from `opencode.db` by shelling out to the external `sqlite3` CLI and querying only the `session` table. Against current OpenCode storage this loses live data and fails silently:

- A live install (snapshot 2026-10-08) has both `session` (443 rows) and `session_v2` (232 rows) tables, with 201 overlapping ids. Both tables receive writes; in the previous 7 days, 21 sessions existed only in `session_v2`. The adapter never sees those.
- `sqlite3` is an undeclared runtime dependency. If the binary is missing, `queryDb()` catches the failure and returns `[]`, so the source reports "no activity" instead of an error.
- Model metadata is read from `message.data` subqueries, while `session.model` now reliably carries `{"id","providerID","variant"}` JSON in both tables.

Issue: #28.

## Goals

- Read active sessions from both `session` and `session_v2`, merged by `id` with the freshest `time_updated` winning.
- Use Node's built-in `node:sqlite` driver; no external CLI and no native npm dependencies.
- Surface database failures through `WatchContext.onError` (throttled) instead of swallowing them.
- Keep the legacy JSON-file watcher for installs with no `opencode.db`.

## Non-Goals

- No OpenCode SDK/HTTP API integration.
- No changes to other collector plugins or to the plugin SDK.
- No new runtime dependencies.
- No new event types or schema changes; output events keep the existing shape.

## Proposed Solution

### 1. Module Layout

`plugins/plugin-opencode-watch/src/` splits by responsibility:

- `db.ts` — driver access and query logic:
  - `loadDatabaseSync()`: lazily `await import("node:sqlite")` so a Node version without the module cannot crash collector startup.
  - `openOpenCodeDatabase(dbFile)`: opens a read-only `DatabaseSync` handle.
  - `readActiveSessions(db, cutoffMs)`: runs one SELECT per table and returns merged rows.
  - `mergeSessionRows(rowsByTable)`: pure merge, dedupes by `id` keeping max `time_updated`.
- `parse.ts` — event construction:
  - `parseOpenCodeDbEvent()` (existing behavior, moved), `parseOpenCodeSessionFile()` (legacy JSON, unchanged), and `parseSessionModel()`.
- `index.ts` — `OpenCodeWatchPlugin`, watch loop, and error throttling.
- `scanOpenCodeSessions()` — extracted scan unit taking the handle, cutoff, `seen` map, and emit/error callbacks; testable without timers.

### 2. Query and Merge Semantics

For each of `session` and `session_v2`, run the same SELECT (identical columns on both tables; `session_v2` is a superset schema):

- Filter: `time_updated >= ?` and `time_archived IS NULL`; order by `time_updated DESC`.
- Include the existing `message`/`part` subqueries for `modelID`, `providerID`, `lastMessage`, `lastTool`, `lastToolInput` (tool types `tool`, `tool-call`, `tool_use`).
- Table names are internal constants, not user input.

Merge in JS by `id`: when both tables contain a session, keep the row with the greater `time_updated`. The poll loop keeps one read-only handle for the watch lifetime, closes it on `watch` teardown, and drops/reopens it on the next scan if queries fail.

### 3. Model Metadata

`parseSessionModel(modelJson)` parses the `session.model` column:

- Preferred: `{"id":"deepseek-v4.1-flash","providerID":"opencode-go","variant":"max"}` → normalized `provider/model` via existing `normalizeModel()`.
- Fallback: the message subquery `modelID`/`providerID` when `session.model` is null, empty, or unparsable.

### 4. Error Handling and Fallback

- Driver import failure or initial DB open failure: report once via `ctx.onError`, then start the legacy JSON watcher for that root.
- Poll failures: call `ctx.onError` on first occurrence and whenever the error message changes; reset the throttle after a successful scan. No silent `return []` remains.
- Per-row parse errors keep the existing per-row `try/catch` → `ctx.onError`.
- Missing `opencode.db` still selects the legacy JSON watcher with no error (expected for older installs).

### 5. Runtime and Documentation

- Add `"engines": { "node": ">=22.5" }` to the plugin's `package.json` (first Node release with `node:sqlite`).
- Update the README plugin bullet to note built-in SQLite via `node:sqlite` with the legacy JSON fallback.

### 6. Testing

- `db.test.ts`: in-memory `node:sqlite` fixtures with minimal `session`/`session_v2`/`message`/`part` tables. Covers: v2-only rows included, overlapping ids resolve to the freshest `time_updated`, archived/stale rows excluded.
- `parse.test.ts`: `parseSessionModel` variants (provider prefix, slash-containing id, variant ignored, null/empty) and fallback to message model fields.
- `scan` integration test: temp DB file on disk, populated rows, assert emitted events and `seen`-map advance behavior without timers.
- Existing tests remain; suite verified with a clean `npm ci` followed by `npm run build`, `npm run lint`, `npm run test`.

## Evidence Snapshot (2026-10-08)

- `~/.local/share/opencode/opencode.db`: `session` 443 rows, `session_v2` 232 rows, 201 overlapping ids.
- Last 7 days: 21 sessions present only in `session_v2`; recent `session` rows were absent from `session_v2` (both tables actively written).
- `session_v2` columns include `workspace_id`, `model`, `time_suspended`, `time_idle`, `time_viewed`, `idle_outcome`; all columns the adapter reads exist in both tables.
- `part.data.type` values observed: `text`, `tool`, `file`, `patch`, `reasoning`, `step-start`, `step-finish`, `compaction`; tool input resolves at `state.input.command`.
- `node:sqlite` verified on Node 24.21: `DatabaseSync` read-only open and `json_extract` queries work; TS types ship in `@types/node`.
- npm 12 blocks lifecycle scripts by default (`esbuild`, `fsevents`, `unrs-resolver` warnings), reinforcing the no-native-dependency choice.

## Risks and Mitigations

- **OpenCode swaps canonical tables again.** Union-read both tables; no heuristic table detection to break.
- **Read-only open fails while OpenCode holds WAL locks.** Same-user WAL reads are supported; on failure the watcher reports via `onError` and the legacy fallback still runs.
- **Duplicate emission when a session moves from one table to the other.** The `seen` map keys on session id and compares `time_updated`, independent of source table.
