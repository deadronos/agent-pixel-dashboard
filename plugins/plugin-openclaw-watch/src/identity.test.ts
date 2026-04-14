import { describe, it, expect } from "vitest";

import {
  encodeSessionKey,
  decodeSessionKey,
  getOpenClawAgentId,
  buildOpenClawSessionId,
} from "./identity.js";

describe("Identity Utils", () => {
  describe("encodeSessionKey", () => {
    it("should URL encode strings", () => {
      expect(encodeSessionKey("test")).toBe("test");
      expect(encodeSessionKey("test value!")).toBe("test%20value!");
      expect(encodeSessionKey("special/chars?")).toBe("special%2Fchars%3F");
    });
  });

  describe("decodeSessionKey", () => {
    it("should URL decode strings", () => {
      expect(decodeSessionKey("test")).toBe("test");
      expect(decodeSessionKey("test%20value!")).toBe("test value!");
      expect(decodeSessionKey("special%2Fchars%3F")).toBe("special/chars?");
    });
  });

  describe("getOpenClawAgentId", () => {
    it("should extract agent ID from a valid Unix file path", () => {
      const filePath = "/home/user/.openclaw/agents/agent-123/sessions/session-456.jsonl";
      expect(getOpenClawAgentId(filePath)).toBe("agent-123");
    });

    it("should extract and decode agent ID from a valid file path", () => {
      const filePath = "/home/user/.openclaw/agents/agent%20123/sessions/session-456.jsonl";
      expect(getOpenClawAgentId(filePath)).toBe("agent 123");
    });

    it("should extract agent ID from a valid Windows file path", () => {
      const filePath = "C:\\Users\\user\\.openclaw\\agents\\agent-456\\sessions\\session-789.jsonl";
      expect(getOpenClawAgentId(filePath)).toBe("agent-456");
    });

    it("should return null for an invalid file path", () => {
      const filePath = "/home/user/other-folder/session-456.jsonl";
      expect(getOpenClawAgentId(filePath)).toBeNull();
    });

    it("should return null for a path that does not end with .jsonl", () => {
      const filePath = "/home/user/.openclaw/agents/agent-123/sessions/session-456.json";
      expect(getOpenClawAgentId(filePath)).toBeNull();
    });
  });

  describe("buildOpenClawSessionId", () => {
    it("should return formatted session ID when agentId is provided and explicit session id is not in record", () => {
      const agentId = "agent-1";
      const filePath = "/path/to/session-2.jsonl";
      expect(buildOpenClawSessionId(agentId, filePath)).toBe("openclaw:agent-1:session-2");
    });

    it("should handle explicit session_id in the record", () => {
      const agentId = "agent-1";
      const filePath = "/path/to/session-2.jsonl";
      const record = { session_id: "explicit-session-3" };
      expect(buildOpenClawSessionId(agentId, filePath, record)).toBe("openclaw:agent-1:explicit-session-3");
    });

    it("should handle explicit sessionId in the record", () => {
      const agentId = "agent-1";
      const filePath = "/path/to/session-2.jsonl";
      const record = { sessionId: "explicit-session-3" };
      expect(buildOpenClawSessionId(agentId, filePath, record)).toBe("openclaw:agent-1:explicit-session-3");
    });

    it("should handle explicit conversation_id in the record", () => {
      const agentId = "agent-1";
      const filePath = "/path/to/session-2.jsonl";
      const record = { conversation_id: "explicit-session-3" };
      expect(buildOpenClawSessionId(agentId, filePath, record)).toBe("openclaw:agent-1:explicit-session-3");
    });

    it("should handle explicit id in the record", () => {
      const agentId = "agent-1";
      const filePath = "/path/to/session-2.jsonl";
      const record = { id: "explicit-session-3" };
      expect(buildOpenClawSessionId(agentId, filePath, record)).toBe("openclaw:agent-1:explicit-session-3");
    });

    it("should encode agentId and fileId when building the session ID", () => {
      const agentId = "agent 1";
      const filePath = "/path/to/session 2.jsonl";
      expect(buildOpenClawSessionId(agentId, filePath)).toBe("openclaw:agent%201:session%202");
    });

    it("should handle null agentId and no record", () => {
      const filePath = "/path/to/session-2.jsonl";
      expect(buildOpenClawSessionId(null, filePath)).toBe("openclaw-session-2");
    });

    it("should handle null agentId with explicit id in record", () => {
      const filePath = "/path/to/session-2.jsonl";
      const record = { session_id: "explicit-session-3" };
      expect(buildOpenClawSessionId(null, filePath, record)).toBe("openclaw-explicit-session-3");
    });
  });
});
