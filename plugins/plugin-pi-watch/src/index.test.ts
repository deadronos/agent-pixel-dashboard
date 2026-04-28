import { describe, expect, it } from "vitest";

import { parsePiRecord } from "./index.js";

describe("parsePiRecord", () => {
  it("normalizes Pi agent message records into shared events", () => {
    const event = parsePiRecord(
      "workstation",
      "/Users/test/.pi/agent/sessions/--Users-test-work--/abc.jsonl",
      {
        type: "message",
        timestamp: "2026-04-09T20:15:31.000Z",
        message: {
          role: "assistant",
          model: "MiniMax-M2.7",
          provider: "minimax",
          content: [
            { type: "toolCall", name: "bash", arguments: { command: "npm test" } },
            { type: "text", text: "Tests are green" }
          ]
        }
      },
      3,
      "2026-04-09T20:15:30.000Z"
    );

    expect(event).toMatchObject({
      source: "pi",
      entityId: "pi:session:abc",
      sessionId: "abc",
      displayName: "Pi",
      eventType: "message",
      summary: "Tests are green",
      detail: "npm test"
    });
    expect(event.meta).toMatchObject({
      groupKey: "/Users/test/work",
      toolName: "bash",
      model: "minimax/MiniMax-M2.7"
    });
  });
});
