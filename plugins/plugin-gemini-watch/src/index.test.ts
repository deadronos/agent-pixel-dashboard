import { describe, expect, it } from "vitest";

import { parseGeminiSessionFile } from "./index.js";

describe("parseGeminiSessionFile", () => {
  it("normalizes gemini session files into shared events", () => {
    const event = parseGeminiSessionFile(
      "workstation",
      "/Users/test/.gemini/tmp/project/chats/session-abc123.json",
      {
        sessionId: "abc123",
        projectHash: "workspace-a",
        messages: [
          { type: "message", content: "Earlier update" },
          {
            type: "tool_call",
            content: "Invoking shell",
            model: "gemini-3.1-pro",
            toolCalls: [{ name: "shell", model: "gemini-3.1-pro" }]
          }
        ]
      },
      1,
      "2026-04-09T20:15:31.000Z"
    );

    expect(event).toMatchObject({
      source: "gemini",
      entityId: "gemini:session:abc123",
      eventType: "tool_call",
      summary: "Invoking shell",
      detail: "workspace-a"
    });
    expect(event.meta).toMatchObject({
      groupKey: "workspace-a",
      toolName: "shell",
      model: "gemini-3.1-pro"
    });
  });
});
