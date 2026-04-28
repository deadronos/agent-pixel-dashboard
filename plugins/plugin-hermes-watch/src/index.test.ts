import { describe, expect, it } from "vitest";

import { parseHermesRecord } from "./index.js";

describe("parseHermesRecord", () => {
  it("normalizes Hermes session metadata into shared events", () => {
    const event = parseHermesRecord(
      "workstation",
      "/Users/test/.hermes/sessions/session_abc.json",
      {
        session_id: "abc",
        provider: "openai",
        model: "gpt-5.4",
        cwd: "/workspace/demo",
        updated_at: "2026-04-09T20:15:31.000Z",
        messages: [
          { role: "user", content: "Fix it" },
          { role: "assistant", content: "Done", tool_calls: [{ function: { name: "shell" } }] }
        ]
      },
      1,
      "2026-04-09T20:15:30.000Z"
    );

    expect(event).toMatchObject({
      source: "hermes",
      entityId: "hermes:session:abc",
      sessionId: "abc",
      displayName: "Hermes",
      eventType: "session_update",
      summary: "Done",
      detail: "/workspace/demo"
    });
    expect(event.meta).toMatchObject({
      groupKey: "/workspace/demo",
      model: "openai/gpt-5.4",
      toolName: "shell"
    });
  });
});
