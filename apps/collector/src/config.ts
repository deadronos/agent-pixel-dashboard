import os from "node:os";

export interface CollectorConfig {
  collectorId: string;
  hostName: string;
  hubUrl: string;
  hubToken: string;
  flushIntervalMs: number;
  codexRoots: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv): CollectorConfig {
  return {
    collectorId: env.COLLECTOR_ID ?? `collector-${os.hostname()}`,
    hostName: env.COLLECTOR_HOST ?? os.hostname(),
    hubUrl: env.HUB_URL ?? "http://localhost:3030",
    hubToken: env.HUB_AUTH_TOKEN ?? "dev-secret",
    flushIntervalMs: Number(env.FLUSH_INTERVAL_MS ?? 500),
    codexRoots: (env.CODEX_SESSION_ROOTS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  };
}
