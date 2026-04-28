import path from "node:path";

import type { CollectorPlugin, DiscoveredSessionRoot, PluginContext, WatchContext, WatchHandle } from "@agent-watch/plugin-sdk";
import {
  buildNormalizedSessionEvent,
  discoverSessionRoots,
  getFirstTextContent,
  getToolCall,
  getStringValue,
  matchesSessionFile,
  watchJsonSessionFiles,
  watchJsonlSessionFiles,
  type SessionSource
} from "@agent-watch/plugin-sdk";

const SOURCE: SessionSource = "hermes";
const DEFAULT_PATHS = ["~/.hermes/sessions", "~/.hermes"];
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function timestamp(value: unknown, fallback: string): string {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return fallback;
}

function modelName(record: Record<string, unknown>): string | undefined {
  const provider = getStringValue(record.provider);
  const model = getStringValue(record.model);
  if (provider && model) {
    return `${provider}/${model}`;
  }
  return model || undefined;
}

function projectName(record: Record<string, unknown>): string | undefined {
  const origin = asRecord(record.origin);
  if (origin) {
    const platform = getStringValue(origin.platform);
    const chat = getStringValue(origin.chat_name) || getStringValue(origin.chat_id);
    if (platform && chat) {
      return `${platform}:${chat}`;
    }
  }
  return getStringValue(record.cwd) || getStringValue(record.platform) || undefined;
}

function textFromContent(value: unknown): string {
  return getFirstTextContent(value);
}

function toolSummary(record: Record<string, unknown>): { name?: string; detail?: string } {
  for (const call of asArray(record.tool_calls)) {
    const tool = getToolCall(call);
    if (tool) {
      return tool;
    }
  }
  const tool = getToolCall(record);
  return tool ?? {};
}

function latestMessage(record: Record<string, unknown>): { text?: string; tool?: string; toolDetail?: string } {
  let text = "";
  let tool: string | undefined;
  let toolDetail: string | undefined;
  for (const entry of asArray(record.messages)) {
    const entryRecord = asRecord(entry);
    if (!entryRecord) {
      continue;
    }
    const nextTool = toolSummary(entryRecord);
    tool = nextTool.name || tool;
    toolDetail = nextTool.detail || toolDetail;
    const role = getStringValue(entryRecord.role) || getStringValue(entryRecord.type);
    if (role !== "tool" && role !== "tool_call") {
      text = textFromContent(entryRecord.content) || getStringValue(entryRecord.text) || text;
    }
  }
  return { text: text || undefined, tool, toolDetail };
}

export function parseHermesRecord(
  sourceHost: string,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
) {
  const sessionId = getStringValue(record.session_id) ||
    getStringValue(record.sessionId) ||
    path.basename(filePath).replace(/^session_/, "").replace(/\.(jsonl|json)$/, "");
  const project = projectName(record);
  const latest = latestMessage(record);

  return buildNormalizedSessionEvent({
    source: SOURCE,
    sourceHost,
    filePath,
    sessionId,
    entityId: `${SOURCE}:session:${sessionId}`,
    displayName: "Hermes",
    timestamp: timestamp(record.updated_at ?? record.last_updated ?? record.timestamp ?? record.created_at, fallbackTimestamp),
    eventType: getStringValue(record.type) || "session_update",
    summary: latest.text || getStringValue(record.summary) || "Hermes activity",
    defaultSummary: "Hermes activity",
    detail: latest.toolDetail || project,
    activityScore: latest.tool ? 0.85 : 0.65,
    sequence,
    meta: {
      filePath,
      groupKey: project,
      model: modelName(record),
      toolName: latest.tool
    }
  });
}

export class HermesWatchPlugin implements CollectorPlugin {
  id = "plugin-hermes-watch";
  source = SOURCE;

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    return discoverSessionRoots(config, {
      envVar: "HERMES_DIR",
      defaultRoots: DEFAULT_PATHS,
      idPrefix: "hermes-root"
    });
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const activeWindowMs = Number(process.env.HERMES_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    return root.path.endsWith("sessions")
      ? watchJsonSessionFiles(root, ctx, {
        matchFile: MATCH_SESSION_FILE,
        activeWindowMs,
        parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
          parseHermesRecord(root.host, filePath, record, sequence, fallbackTimestamp)
      })
      : watchJsonlSessionFiles(root, ctx, {
        matchFile: MATCH_SESSION_FILE,
        activeWindowMs,
        parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
          parseHermesRecord(root.host, filePath, record, sequence, fallbackTimestamp)
      });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new HermesWatchPlugin();
}
