import { describe, expect, it } from "vitest";

import { buildOpenClawSessionId, getOpenClawAgentId } from "./identity.js";

import { parseOpenClawRecord } from "./index.js";

describe("openclaw identity helpers", () => {
  it("extracts agent id from standard agent session path", () => {
    const filePath = "/Users/test/.openclaw/agents/researcher/sessions/abc123.jsonl";
    expect(getOpenClawAgentId(filePath)).toBe("researcher");
  });

  it("builds agent-aware session ids", () => {
    const filePath = "/Users/test/.openclaw/agents/clawson/sessions/abc123.jsonl";
    expect(buildOpenClawSessionId("clawson", filePath)).toBe("openclaw:clawson:abc123");
  });

  it("falls back to legacy style when agent id is unavailable", () => {
    const filePath = "/Users/test/.openclaw/sessions/abc123.jsonl";
    expect(buildOpenClawSessionId(null, filePath)).toBe("openclaw-abc123");
  });

  it("normalizes openclaw records into shared events", () => {
    const event = parseOpenClawRecord(
      "workstation",
      "/Users/test/.openclaw/agents/researcher/sessions/abc123.jsonl",
      {
        type: "tool_call",
        message: {
          role: "assistant",
          model: "opus",
          name: "shell"
        }
      },
      1,
      "2026-04-09T20:15:31.000Z"
    );

    expect(event).toMatchObject({
      source: "openclaw",
      entityId: "openclaw:session:openclaw:researcher:abc123",
      sessionId: "openclaw:researcher:abc123",
      displayName: "researcher",
      eventType: "tool_call",
      summary: "shell",
      detail: "opus"
    });
    expect(event.meta).toMatchObject({
      agentId: "researcher",
      groupKey: "researcher",
      toolName: "shell"
    });
  });

  it("extracts OpenClaw assistant text and tool_use content", () => {
    const event = parseOpenClawRecord(
      "workstation",
      "/Users/test/.openclaw/agents/researcher/sessions/abc123.jsonl",
      {
        type: "message",
        message: {
          role: "assistant",
          model: "gpt-5.4",
          content: [
            { type: "tool_use", name: "Shell", input: { command: "git status --short" } },
            { type: "text", text: "Status is clean." }
          ]
        }
      },
      2,
      "2026-04-09T20:15:31.000Z"
    );

    expect(event).toMatchObject({
      eventType: "tool_use",
      summary: "Shell",
      detail: "git status --short"
    });
    expect(event.meta).toMatchObject({
      model: "gpt-5.4",
      role: "assistant",
      toolName: "Shell"
    });
  });
});
