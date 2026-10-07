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
