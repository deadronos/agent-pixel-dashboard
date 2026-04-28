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

  it("normalizes live gemini jsonl records without drifting the session id", () => {
    const filePath = "/Users/test/.gemini/tmp/agent-pixel-dashboard/chats/session-2026-04-28T15-53-80ae1704.jsonl";
    const initial = parseGeminiSessionFile(
      "workstation",
      filePath,
      {
        sessionId: "80ae1704-d60d-46c5-a56b-4ba504a27ab4",
        projectHash: "agent-pixel-dashboard",
        startTime: "2026-04-28T15:53:55.142Z",
        lastUpdated: "2026-04-28T15:53:55.142Z",
        kind: "main"
      },
      1,
      "2026-04-28T15:53:55.142Z"
    );
    const update = parseGeminiSessionFile(
      "workstation",
      filePath,
      {
        id: "3f596c55-4499-4469-b986-4da69e0bcd17",
        timestamp: "2026-04-28T15:55:50.923Z",
        type: "gemini",
        content: "Review complete",
        model: "gemini-3-flash-preview"
      },
      2,
      "2026-04-28T15:55:50.923Z"
    );

    expect(initial.sessionId).toBe("2026-04-28T15-53-80ae1704");
    expect(update).toMatchObject({
      source: "gemini",
      entityId: "gemini:session:2026-04-28T15-53-80ae1704",
      sessionId: "2026-04-28T15-53-80ae1704",
      eventType: "gemini",
      summary: "Review complete"
    });
    expect(update.meta).toMatchObject({
      groupKey: "agent-pixel-dashboard",
      model: "gemini-3-flash-preview"
    });
  });
});
