import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setInterval } from 'node:timers';

import {
  makeDeterministicEventId,
  parseNormalizedEvent,
  type NormalizedEvent,
} from '@agent-watch/event-schema';
import {
  isActiveSessionFile,
  matchesSessionFile,
  type SessionSource,
} from '@agent-watch/plugin-sdk';
import type {
  CollectorPlugin,
  DiscoveredSessionRoot,
  PluginContext,
  WatchContext,
  WatchHandle,
} from '@agent-watch/plugin-sdk';

import { buildOpenClawSessionId, getOpenClawAgentId } from './identity.js';
import { collectJsonlFiles } from './polling.js';

const DEFAULT_PATHS = ['~/.openclaw/agents', '~/.openclaw'];
const DEFAULT_SCAN_INTERVAL_MS = 2000;
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_FILES = 5000;
const SOURCE: SessionSource = 'openclaw';

function expandHome(input: string): string {
  if (!input.startsWith('~')) {
    return input;
  }
  return path.join(os.homedir(), input.slice(1));
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function parseRecord(
  sourceHost: string,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
): NormalizedEvent {
  const message =
    record.message && typeof record.message === 'object'
      ? (record.message as Record<string, unknown>)
      : undefined;
  const agentId = getOpenClawAgentId(filePath);
  const sessionId = buildOpenClawSessionId(agentId, filePath, record);
  const entityId = `openclaw:session:${sessionId}`;

  const timestamp =
    getString(record.timestamp) ||
    getString(record.created_at) ||
    getString(record.createdAt) ||
    fallbackTimestamp;

  const eventType = getString(record.event_type) || getString(record.type) || 'message';

  const summary =
    getString(message?.role) ||
    getString(record.summary) ||
    getString(record.message) ||
    getString(record.text) ||
    getString(record.content);

  const detail =
    getString(message?.model) ||
    getString(record.detail) ||
    getString(record.content) ||
    getString(record.raw);

  const rawActivity = typeof record.activityScore === 'number' ? record.activityScore : undefined;
  const activityScore = rawActivity ?? (eventType.startsWith('tool') ? 0.85 : 0.6);

  const event = {
    eventId: makeDeterministicEventId({
      source: 'openclaw',
      entityId,
      timestamp,
      eventType,
      sequence,
      detail: detail || summary,
    }),
    timestamp,
    source: 'openclaw',
    sourceHost,
    entityId,
    sessionId,
    parentEntityId: null,
    entityKind: 'session' as const,
    displayName: agentId || 'OpenClaw',
    eventType,
    status: getString(record.status, 'active'),
    summary: summary || 'OpenClaw activity',
    detail: detail || undefined,
    activityScore: Math.max(0, Math.min(1, activityScore)),
    sequence,
    meta: {
      filePath,
      agentId: agentId || undefined,
      groupKey: agentId || undefined,
      toolName:
        getString(record.toolName) || getString(record.tool_name) || getString(message?.name),
      rawType: getString(record.type),
    },
  };

  return parseNormalizedEvent(event);
}

export class OpenClawWatchPlugin implements CollectorPlugin {
  id = 'plugin-openclaw-watch';
  source = 'openclaw';

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    const envRoots = (config.env.OPENCLAW_SESSION_ROOTS ?? '')
      .split(',')
      .map((value: string) => value.trim())
      .filter(Boolean);

    const configured =
      config.configuredRoots.length > 0 ? config.configuredRoots : [...envRoots, ...DEFAULT_PATHS];
    const roots = configured.map(expandHome);
    const discovered: DiscoveredSessionRoot[] = [];

    await Promise.all(
      roots.map(async (rootPath: string, index: number) => {
        try {
          const stat = await fs.stat(rootPath);
          if (!stat.isDirectory()) {
            return;
          }
          discovered.push({ id: `openclaw-root-${index}`, path: rootPath, host: config.host });
        } catch {
          // ignore missing roots
        }
      })
    );

    return discovered;
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const offsets = new Map<string, number>();
    const sequences = new Map<string, number>();
    const mtimes = new Map<string, number>();
    const activeWindowMs = Number(process.env.OPENCLAW_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    const scanIntervalMs = Number(
      process.env.OPENCLAW_SCAN_INTERVAL_MS ?? DEFAULT_SCAN_INTERVAL_MS
    );
    const maxDepth = Number(process.env.OPENCLAW_SCAN_MAX_DEPTH ?? DEFAULT_MAX_DEPTH);
    const maxFiles = Number(process.env.OPENCLAW_SCAN_MAX_FILES ?? DEFAULT_MAX_FILES);
    let closed = false;
    let scanning = false;

    const ingestFile = async (
      filePath: string,
      stat: { size: number; mtime: Date }
    ): Promise<void> => {
      if (!filePath.endsWith('.jsonl')) {
        return;
      }

      try {
        const previousOffset = offsets.get(filePath) ?? 0;
        const nextOffset = stat.size < previousOffset ? 0 : previousOffset;

        let handle: import('node:fs/promises').FileHandle | undefined;
        try {
          handle = await fs.open(filePath, 'r');
        } catch (error) {
          ctx.onError(error as Error);
          return;
        }
        try {
          const length = stat.size - nextOffset;
          if (length <= 0) {
            offsets.set(filePath, stat.size);
            return;
          }

          const buffer = Buffer.alloc(length);
          await handle.read(buffer, 0, length, nextOffset);
          const text = buffer.toString('utf8');
          const lines = text.split('\n').filter(line => line.trim().length > 0);

          for (const line of lines) {
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(line) as Record<string, unknown>;
            } catch {
              continue;
            }

            const sequence = (sequences.get(filePath) ?? 0) + 1;
            sequences.set(filePath, sequence);

            try {
              const event = parseRecord(
                root.host,
                filePath,
                parsed,
                sequence,
                stat.mtime.toISOString()
              );
              ctx.onEvent(event);
            } catch (error) {
              ctx.onError(error as Error);
            }
          }

          offsets.set(filePath, stat.size);
        } finally {
          await handle.close();
        }
      } catch (error) {
        ctx.onError(error as Error);
      }
    };

    const scan = async (): Promise<void> => {
      if (closed || scanning) {
        return;
      }
      scanning = true;
      try {
        const files = await collectJsonlFiles(root.path, {
          maxDepth: Number.isFinite(maxDepth) ? maxDepth : DEFAULT_MAX_DEPTH,
          maxFiles: Number.isFinite(maxFiles) ? maxFiles : DEFAULT_MAX_FILES,
        });
        const live = new Set(files);

        for (const filePath of files) {
          if (!matchesSessionFile(SOURCE, filePath)) {
            continue;
          }
          let stat;
          try {
            stat = await fs.stat(filePath);
          } catch {
            continue;
          }

          const previousMtime = mtimes.get(filePath);
          const previousOffset = offsets.get(filePath);
          if (previousMtime === undefined) {
            // Initial seed avoids replaying old history when starting watcher.
            mtimes.set(filePath, stat.mtimeMs);
            offsets.set(filePath, stat.size);
            continue;
          }

          if (!isActiveSessionFile(stat.mtimeMs, Date.now(), activeWindowMs)) {
            mtimes.set(filePath, stat.mtimeMs);
            offsets.set(filePath, stat.size);
            continue;
          }

          if (stat.size === previousOffset && stat.mtimeMs <= previousMtime) {
            continue;
          }

          await ingestFile(filePath, { size: stat.size, mtime: stat.mtime });
          mtimes.set(filePath, stat.mtimeMs);
        }

        for (const key of [...mtimes.keys()]) {
          if (!live.has(key)) {
            mtimes.delete(key);
            offsets.delete(key);
            sequences.delete(key);
          }
        }
      } catch (error) {
        ctx.onError(error as Error);
      } finally {
        scanning = false;
      }
    };

    await scan();
    const timer = setInterval(
      () => {
        void scan();
      },
      Number.isFinite(scanIntervalMs) ? scanIntervalMs : DEFAULT_SCAN_INTERVAL_MS
    );

    return {
      close: async () => {
        closed = true;
        clearInterval(timer);
      },
    };
  }
}

export default function createPlugin(): CollectorPlugin {
  return new OpenClawWatchPlugin();
}
