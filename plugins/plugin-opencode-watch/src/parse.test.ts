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
