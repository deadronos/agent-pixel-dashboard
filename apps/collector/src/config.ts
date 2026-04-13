import os from 'node:os';

export interface CollectorConfig {
  collectorId: string;
  hostName: string;
  hubUrl: string;
  hubToken: string;
  flushIntervalMs: number;
  maxBatchBytes: number;
  watchSources: string[];
  pluginsDir: string;
  codexRoots: string[];
}

export function loadConfig(env: Record<string, string | undefined>): CollectorConfig {
  return {
    collectorId: env.COLLECTOR_ID ?? `collector-${os.hostname()}`,
    hostName: env.COLLECTOR_HOST ?? os.hostname(),
    hubUrl: env.HUB_URL ?? 'http://localhost:3030',
    hubToken: env.HUB_AUTH_TOKEN ?? 'dev-secret',
    flushIntervalMs: Number(env.FLUSH_INTERVAL_MS ?? 500),
    maxBatchBytes: Number(env.MAX_BATCH_BYTES ?? 1_500_000),
    watchSources: (env.WATCH_SOURCES ?? 'auto')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
    pluginsDir: env.PLUGINS_DIR ?? '',
    codexRoots: (env.CODEX_SESSION_ROOTS ?? '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  };
}
