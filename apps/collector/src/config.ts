import os from "node:os";

export interface CollectorConfig {
  collectorId: string;
  hostName: string;
  hubUrl: string;
  hubToken: string;
  flushIntervalMs: number;
  maxBatchBytes: number;
  watchSources: string[];
  pluginsDir: string;
  sessionRoots: string[];
}

function requireHubToken(env: Record<string, string | undefined>): string {
  const token = env.HUB_AUTH_TOKEN;
  if (!token) {
    throw new Error("HUB_AUTH_TOKEN environment variable is required");
  }
  return token;
}

function clampFlushIntervalMs(value: number): number {
  // setInterval(fn, 0) spins — enforce minimum of 100ms
  if (!Number.isFinite(value) || value < 100) {
    return 500;
  }
  return Math.min(value, 3_600_000); // cap at 1 hour
}

function clampMaxBatchBytes(value: number): number {
  if (!Number.isFinite(value) || value < 1024) {
    return 1_500_000;
  }
  return Math.min(value, 10_000_000); // cap at 10MB
}

export function loadConfig(env: Record<string, string | undefined>): CollectorConfig {
  const sessionRootsSource = env.SESSION_ROOTS ?? env.CODEX_SESSION_ROOTS ?? "";

  return {
    collectorId: env.COLLECTOR_ID ?? `collector-${os.hostname()}`,
    hostName: env.COLLECTOR_HOST ?? os.hostname(),
    hubUrl: env.HUB_URL ?? "http://localhost:3030",
    hubToken: requireHubToken(env),
    flushIntervalMs: clampFlushIntervalMs(Number(env.FLUSH_INTERVAL_MS ?? 500)),
    maxBatchBytes: clampMaxBatchBytes(Number(env.MAX_BATCH_BYTES ?? 1_500_000)),
    watchSources: (env.WATCH_SOURCES ?? "auto")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    pluginsDir: env.PLUGINS_DIR ?? "",
    sessionRoots: sessionRootsSource
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  };
}
