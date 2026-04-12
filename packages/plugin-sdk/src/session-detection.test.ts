import { describe, expect, it } from "vitest";

import { isActiveSessionFile, matchesSessionFile } from "./session-detection.js";

describe("matchesSessionFile", () => {
  it("matches codex rollout files only", () => {
    expect(matchesSessionFile("codex", "/Users/test/.codex/sessions/2026/04/09/rollout-abc.jsonl")).toBe(true);
    expect(matchesSessionFile("codex", "/Users/test/.codex/transcripts/foo.jsonl")).toBe(false);
  });

  it("matches gemini session json files", () => {
    expect(matchesSessionFile("gemini", "/Users/test/.gemini/tmp/hash/chats/session-abc.json")).toBe(true);
    expect(matchesSessionFile("gemini", "/Users/test/.gemini/transcripts/foo.jsonl")).toBe(false);
  });

  it("matches copilot events files", () => {
    expect(matchesSessionFile("copilot", "/Users/test/.copilot/session-state/uuid/events.jsonl")).toBe(true);
    expect(matchesSessionFile("copilot", "/Users/test/.copilot/session-state/uuid/other.jsonl")).toBe(false);
  });

  it("matches openclaw agent session files", () => {
    expect(matchesSessionFile("openclaw", "/Users/test/.openclaw/agents/researcher/sessions/abc.jsonl")).toBe(true);
    expect(matchesSessionFile("openclaw", "/Users/test/.openclaw/state/abc.jsonl")).toBe(false);
  });

  it("matches claude project and subagent jsonl files", () => {
    expect(matchesSessionFile("claude", "/Users/test/.claude/projects/foo/session.jsonl")).toBe(true);
    expect(matchesSessionFile("claude", "/Users/test/.claude/history.jsonl")).toBe(false);
  });
});

describe("isActiveSessionFile", () => {
  it("uses an active mtime window", () => {
    const now = 1_000_000;
    expect(isActiveSessionFile(now - 30_000, now, 120_000)).toBe(true);
    expect(isActiveSessionFile(now - 180_000, now, 120_000)).toBe(false);
  });
});
