import { describe, expect, it } from "vitest";

import { parseCodexRecord } from "./index.js";

describe("parseCodexRecord", () => {
  it("normalizes codex rollout records into shared events", () => {
    const event = parseCodexRecord(
      "workstation",
      "/Users/test/.codex/sessions/rollout-abc123.jsonl",
      {
        payload: {
          id: "abc123",
          type: "tool_call",
          name: "bash",
          arguments: "ls -la",
          model: "gpt-5.4"
        },
        status: "active",
        activityScore: 0.9
      },
      2,
      "2026-04-09T20:15:31.000Z"
    );

    expect(event).toMatchObject({
      source: "codex",
      entityId: "codex:session:abc123",
      sessionId: "abc123",
      eventType: "tool_call",
      summary: "bash",
      detail: "ls -la",
      activityScore: 0.9
    });
    expect(event.meta).toMatchObject({
      toolName: "bash",
      model: "gpt-5.4"
    });
  });

  it("extracts assistant text from response_item messages", () => {
    const event = parseCodexRecord(
      "workstation",
      "/Users/test/.codex/sessions/rollout-abc123.jsonl",
      {
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "I found the failing test." }]
        }
      },
      3,
      "2026-04-09T20:15:32.000Z"
    );

    expect(event).toMatchObject({
      eventType: "message",
      summary: "I found the failing test.",
      detail: "assistant"
    });
    expect(event.meta).toMatchObject({
      role: "assistant"
    });
  });

  it("uses tool names and formatted arguments for function calls", () => {
    const event = parseCodexRecord(
      "workstation",
      "/Users/test/.codex/sessions/rollout-abc123.jsonl",
      {
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: { cmd: "npm test", workdir: "/repo" }
        }
      },
      4,
      "2026-04-09T20:15:33.000Z"
    );

    expect(event).toMatchObject({
      eventType: "function_call",
      summary: "exec_command",
      detail: "npm test"
    });
    expect(event.meta).toMatchObject({
      toolName: "exec_command"
    });
  });
});
