import { describe, expect, it } from "vitest";

import { isActiveSessionFile, matchesSessionFile } from "./session-detection.js";

describe("matchesSessionFile", () => {
  it("matches codex rollout files only", () => {
    expect(matchesSessionFile("codex", "/Users/test/.codex/sessions/2026/04/09/rollout-abc.jsonl")).toBe(true);
    expect(matchesSessionFile("codex", "/Users/test/.codex/transcripts/foo.jsonl")).toBe(false);
    expect(matchesSessionFile("codex", "/Users/test/.codex/sessions/2026/04/09/abc.jsonl")).toBe(false); // missing rollout-
    expect(matchesSessionFile("codex", "/Users/test/.codex/sessions/2026/04/09/rollout-abc.json")).toBe(false); // wrong extension
    expect(matchesSessionFile("codex", "C:\\Users\\test\\.codex\\sessions\\2026\\04\\09\\rollout-abc.jsonl")).toBe(true); // windows path
  });

  it("matches gemini session json files", () => {
    expect(matchesSessionFile("gemini", "/Users/test/.gemini/tmp/hash/chats/session-abc.json")).toBe(true);
    expect(matchesSessionFile("gemini", "/Users/test/.gemini/transcripts/foo.jsonl")).toBe(false);
    expect(matchesSessionFile("gemini", "/Users/test/.gemini/tmp/hash/chats/abc.json")).toBe(false); // missing session-
    expect(matchesSessionFile("gemini", "/Users/test/.gemini/tmp/hash/chats/session-abc.jsonl")).toBe(false); // wrong extension
    expect(matchesSessionFile("gemini", "/Users/test/.gemini/tmp/hash/other/session-abc.json")).toBe(false); // missing chats/
    expect(matchesSessionFile("gemini", "C:\\Users\\test\\.gemini\\tmp\\hash\\chats\\session-abc.json")).toBe(true); // windows path
  });

  it("matches copilot events files", () => {
    expect(matchesSessionFile("copilot", "/Users/test/.copilot/session-state/uuid/events.jsonl")).toBe(true);
    expect(matchesSessionFile("copilot", "/Users/test/.copilot/session-state/uuid/other.jsonl")).toBe(false);
    expect(matchesSessionFile("copilot", "/Users/test/.copilot/session-state/uuid/events.json")).toBe(false); // wrong extension
    expect(matchesSessionFile("copilot", "/Users/test/.copilot/other/uuid/events.jsonl")).toBe(false); // wrong directory
    expect(matchesSessionFile("copilot", "C:\\Users\\test\\.copilot\\session-state\\uuid\\events.jsonl")).toBe(true); // windows path
  });

  it("matches openclaw agent session files", () => {
    expect(matchesSessionFile("openclaw", "/Users/test/.openclaw/agents/researcher/sessions/abc.jsonl")).toBe(true);
    expect(matchesSessionFile("openclaw", "/Users/test/.openclaw/state/abc.jsonl")).toBe(false);
    expect(matchesSessionFile("openclaw", "/Users/test/.openclaw/agents/researcher/sessions/abc.json")).toBe(false); // wrong extension
    expect(matchesSessionFile("openclaw", "/Users/test/.openclaw/agents/researcher/other/abc.jsonl")).toBe(false); // missing sessions/
    expect(matchesSessionFile("openclaw", "C:\\Users\\test\\.openclaw\\agents\\researcher\\sessions\\abc.jsonl")).toBe(true); // windows path
  });

  it("matches claude project and subagent jsonl files", () => {
    expect(matchesSessionFile("claude", "/Users/test/.claude/projects/foo/session.jsonl")).toBe(true);
    expect(matchesSessionFile("claude", "/Users/test/.claude/history.jsonl")).toBe(false);
    expect(matchesSessionFile("claude", "/Users/test/.claude/projects/foo/session.json")).toBe(false); // wrong extension
    expect(matchesSessionFile("claude", "C:\\Users\\test\\.claude\\projects\\foo\\session.jsonl")).toBe(true); // windows path
  });

  it("returns false for unknown source", () => {
    // @ts-expect-error Testing unknown source
    expect(matchesSessionFile("unknown", "/Users/test/.codex/sessions/rollout-abc.jsonl")).toBe(false);
  });
});

describe("isActiveSessionFile", () => {
  it("uses an active mtime window", () => {
    const now = 1_000_000;
    expect(isActiveSessionFile(now - 30_000, now, 120_000)).toBe(true);
    expect(isActiveSessionFile(now - 180_000, now, 120_000)).toBe(false);
  });
});
