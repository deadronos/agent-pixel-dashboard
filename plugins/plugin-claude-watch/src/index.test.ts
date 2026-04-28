import { describe, expect, it } from "vitest";

import { getClaudeProjectKey, parseClaudeRecord } from "./index.js";

describe("getClaudeProjectKey", () => {
  it("extracts project name from standard project path", () => {
    const filePath = "/Users/test/.claude/projects/my-project/sessions/abc.jsonl";
    expect(getClaudeProjectKey(filePath)).toBe("my-project");
  });

  it("handles windows-style backslashes", () => {
    const filePath = "C:\\Users\\test\\.claude\\projects\\work-project\\sessions\\abc.jsonl";
    expect(getClaudeProjectKey(filePath)).toBe("work-project");
  });

  it("extracts assistant text and tool_use blocks from Claude message content", () => {
    const message = parseClaudeRecord(
      "workstation",
      "/Users/test/.claude/projects/my-project/sessions/abc123.jsonl",
      {
        timestamp: "2026-04-09T20:15:31.000Z",
        type: "message",
        message: {
          role: "assistant",
          model: "claude-sonnet",
          content: [{ type: "text", text: "The issue is in the drawer styles." }]
        }
      },
      5,
      "2026-04-09T20:15:31.000Z"
    );
    const tool = parseClaudeRecord(
      "workstation",
      "/Users/test/.claude/projects/my-project/sessions/abc123.jsonl",
      {
        timestamp: "2026-04-09T20:15:32.000Z",
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", name: "Bash", input: { command: "npm run test" } }]
        }
      },
      6,
      "2026-04-09T20:15:32.000Z"
    );

    expect(message).toMatchObject({
      summary: "The issue is in the drawer styles.",
      detail: "assistant"
    });
    expect(message.meta).toMatchObject({ role: "assistant", model: "claude-sonnet" });
    expect(tool).toMatchObject({
      eventType: "tool_use",
      summary: "Bash",
      detail: "npm run test"
    });
    expect(tool.meta).toMatchObject({ toolName: "Bash" });
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
