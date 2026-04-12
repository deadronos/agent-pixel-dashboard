import { describe, expect, it } from "vitest";

import { buildConversationDetailUrl } from "./conversation-detail.js";

describe("buildConversationDetailUrl", () => {
  it("builds the entity-detail URL from a selected session group", () => {
    const url = buildConversationDetailUrl("http://localhost:3032", {
      source: "codex",
      sessionId: "abc",
      entityId: "codex:session:abc"
    });

    expect(url).toBe("http://localhost:3032/api/entity-detail?source=codex&sessionId=abc");
  });

  it("falls back to entityId when a session id is not available", () => {
    const url = buildConversationDetailUrl("http://localhost:3032/", {
      source: "claude",
      entityId: "claude:agent:solo"
    });

    expect(url).toBe("http://localhost:3032/api/entity-detail?source=claude&entityId=claude%3Aagent%3Asolo");
  });
});
