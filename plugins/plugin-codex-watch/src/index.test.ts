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
});
