import path from "node:path";

import type { CollectorPlugin, DiscoveredSessionRoot, PluginContext, WatchContext, WatchHandle } from "@agent-watch/plugin-sdk";
import {
  buildNormalizedSessionEvent,
  discoverSessionRoots,
  getFirstTextContent,
  getFirstToolCallFromContent,
  getStringValue,
  matchesSessionFile,
  watchJsonlSessionFiles,
  type SessionSource
} from "@agent-watch/plugin-sdk";

const SOURCE: SessionSource = "pi";
const DEFAULT_PATHS = ["~/.pi/agent/sessions", "~/.pi"];
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function projectDirToPath(projectDir: string): string | undefined {
  if (!projectDir.startsWith("--")) {
    return undefined;
  }
  const trimmed = projectDir.replace(/^--/, "").replace(/--$/, "");
  if (trimmed.length === 0) {
    return undefined;
  }
  return `/${trimmed.replace(/--/g, "/").replace(/-/g, "/")}`;
}

function getSessionId(filePath: string): string {
  return path.basename(filePath, ".jsonl");
}

function getProject(filePath: string, record: Record<string, unknown>): string | undefined {
  const cwd = getStringValue(record.cwd);
  if (cwd) {
    return cwd;
  }
  return projectDirToPath(path.basename(path.dirname(filePath)));
}

function toolFromContent(value: unknown): { name?: string; detail?: string } {
  return getFirstToolCallFromContent(value) ?? {};
}

function modelName(message: Record<string, unknown>): string | undefined {
  const model = getStringValue(message.model);
  const provider = getStringValue(message.provider);
  if (provider && model && !model.includes("/")) {
    return `${provider}/${model}`;
  }
  return model || undefined;
}

export function parsePiRecord(
  sourceHost: string,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
) {
  const message = asRecord(record.message);
  const content = message?.content;
  const tool = toolFromContent(content);
  const project = getProject(filePath, record);
  const sessionId = getStringValue(record.id) || getSessionId(filePath);

  return buildNormalizedSessionEvent({
    source: SOURCE,
    sourceHost,
    filePath,
    sessionId,
    entityId: `${SOURCE}:session:${sessionId}`,
    displayName: "Pi",
    timestamp: getStringValue(record.timestamp) || fallbackTimestamp,
    eventType: getStringValue(record.type) || "message",
    summary: getFirstTextContent(content) || getStringValue(record.summary) || tool.name || "Pi activity",
    defaultSummary: "Pi activity",
    detail: tool.detail || project,
    activityScore: tool.name ? 0.85 : 0.65,
    sequence,
    meta: {
      filePath,
      groupKey: project,
      toolName: tool.name,
      model: message ? modelName(message) : undefined
    }
  });
}

export class PiWatchPlugin implements CollectorPlugin {
  id = "plugin-pi-watch";
  source = SOURCE;

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    return discoverSessionRoots(config, {
      envVar: "PI_SESSION_ROOTS",
      defaultRoots: DEFAULT_PATHS,
      idPrefix: "pi-root"
    });
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const activeWindowMs = Number(process.env.PI_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    return watchJsonlSessionFiles(root, ctx, {
      matchFile: MATCH_SESSION_FILE,
      activeWindowMs,
      parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
        parsePiRecord(root.host, filePath, record, sequence, fallbackTimestamp)
    });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new PiWatchPlugin();
}
