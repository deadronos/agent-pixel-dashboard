import path from "node:path";

export const sessionSources = ["codex", "claude", "gemini", "openclaw", "copilot", "opencode", "hermes", "pi"] as const;
export type SessionSource = (typeof sessionSources)[number];

export function isSessionSource(value: string): value is SessionSource {
  return (sessionSources as readonly string[]).includes(value);
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function matchesSessionFile(source: SessionSource, filePath: string): boolean {
  const normalized = normalizePath(filePath);
  const base = path.basename(normalized);

  switch (source) {
    case "codex":
      return normalized.includes("/.codex/sessions/") && base.startsWith("rollout-") && base.endsWith(".jsonl");
    case "claude":
      return normalized.includes("/.claude/projects/") && base.endsWith(".jsonl");
    case "gemini":
      return normalized.includes("/.gemini/tmp/") && normalized.includes("/chats/") && base.startsWith("session-") && base.endsWith(".json");
    case "openclaw":
      return normalized.includes("/.openclaw/agents/") && normalized.includes("/sessions/") && base.endsWith(".jsonl");
    case "copilot":
      return normalized.includes("/.copilot/session-state/") && base === "events.jsonl";
    case "opencode":
      return normalized.includes("/opencode/storage/session/") && base.endsWith(".json");
    case "hermes":
      return normalized.includes("/.hermes/sessions/") && (
        (base.startsWith("session_") && base.endsWith(".json")) || base.endsWith(".jsonl")
      );
    case "pi":
      return normalized.includes("/.pi/agent/sessions/") && base.endsWith(".jsonl");
    default:
      return false;
  }
}

export function isActiveSessionFile(mtimeMs: number, nowMs = Date.now(), activeWindowMs = 2 * 60 * 1000): boolean {
  return nowMs - mtimeMs <= activeWindowMs;
}
