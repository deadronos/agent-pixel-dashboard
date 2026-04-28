import { describe, expect, it } from "vitest";

import { parseOpenCodeDbEvent, parseOpenCodeSessionFile } from "./index.js";

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
        modelID: "kimi-k2.6",
        providerID: "moonshotai"
      },
      2
    );

    expect(event).toMatchObject({
      source: "opencode",
      entityId: "opencode:session:ses_live",
      sessionId: "ses_live",
      eventType: "session_update",
      summary: "Live OpenCode",
      detail: "/workspace/live"
    });
    expect(event.meta).toMatchObject({
      filePath: "opencode-db:ses_live",
      groupKey: "/workspace/live",
      model: "moonshotai/kimi-k2.6"
    });
  });
});
