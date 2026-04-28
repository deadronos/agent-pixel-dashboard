import path from "node:path";

import type { CollectorPlugin, DiscoveredSessionRoot, PluginContext, WatchContext, WatchHandle } from "@agent-watch/plugin-sdk";
import {
  buildNormalizedSessionEvent,
  discoverSessionRoots,
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function textFromContent(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  for (const part of asArray(value)) {
    const record = asRecord(part);
    const text = getStringValue(record?.text);
    if (text) {
      return text.trim();
    }
  }
  return "";
}

function toolFromContent(value: unknown): { name?: string; detail?: string } {
  for (const part of asArray(value)) {
    const record = asRecord(part);
    const type = getStringValue(record?.type);
    const name = getStringValue(record?.name);
    if (type !== "toolCall" && !name) {
      continue;
    }
    const args = record?.arguments;
    let detail = "";
    if (typeof args === "string") {
      detail = args;
    } else if (asRecord(args)?.command) {
      detail = String(asRecord(args)?.command);
    } else if (args !== undefined) {
      detail = JSON.stringify(args);
    }
    return { name: name || "toolCall", detail };
  }
  return {};
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
    summary: textFromContent(content) || getStringValue(record.summary) || "Pi activity",
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
