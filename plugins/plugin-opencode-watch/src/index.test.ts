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
