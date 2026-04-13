import { describe, expect, it } from "vitest";

import { getClaudeProjectKey, parseClaudeRecord } from "./index.js";

describe("getClaudeProjectKey", () => {
  it("extracts project name from standard project path", () => {
    const filePath = "/Users/test/.claude/projects/my-project/sessions/abc.jsonl";
    expect(getClaudeProjectKey(filePath)).toBe("my-project");
  });

  it("handles windows-style backslashes", () => {
    const filePath = "C:\Users\test\.claude\projects\work-project\sessions\abc.jsonl";
    expect(getClaudeProjectKey(filePath)).toBe("work-project");
  });
});

describe("parseClaudeRecord", () => {
  it("normalizes claude transcript rows into shared events", () => {
    const event = parseClaudeRecord(
      "workstation",
      "/Users/test/.claude/projects/my-project/sessions/abc123.jsonl",
      {
        created_at: "2026-04-09T20:15:31.000Z",
        type: "tool_result",
        message: "Read the repo",
        toolName: "search"
      },
      4,
      "2026-04-09T20:15:31.000Z"
    );

    expect(event).toMatchObject({
      source: "claude",
      entityId: "claude:session:abc123",
      eventType: "tool_result",
      summary: "Read the repo"
    });
    expect(event.meta).toMatchObject({
      groupKey: "my-project",
      toolName: "search"
    });
  });
});
