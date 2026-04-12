import { describe, expect, it } from "vitest";

import { buildOpenClawSessionId, getOpenClawAgentId } from "./identity.js";

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
});
