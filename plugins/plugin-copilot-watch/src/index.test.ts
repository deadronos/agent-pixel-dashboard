import { describe, expect, it } from "vitest";

import { parseCopilotRecord } from "./index.js";

describe("parseCopilotRecord", () => {
  it("normalizes copilot session records into shared events", () => {
    const event = parseCopilotRecord(
      "workstation",
      "/Users/test/.copilot/session-state/abc123/events.jsonl",
      {
        event_type: "tool_invocation",
        status: "active",
        data: {
          sessionId: "abc123",
          content: "Running a tool",
          selectedModel: "gpt-5.4"
        },
        tool_name: "search"
      },
      3,
      "2026-04-09T20:15:31.000Z"
    );

    expect(event).toMatchObject({
      source: "copilot",
      entityId: "copilot:session:abc123",
      eventType: "tool_invocation",
      summary: "Running a tool"
    });
    expect(event.meta).toMatchObject({
      toolName: "search",
      model: "gpt-5.4"
    });
  });
});
