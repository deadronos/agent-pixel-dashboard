import type {
  CollectorPlugin,
  DiscoveredSessionRoot,
  PluginContext,
  WatchContext,
  WatchHandle
} from "@agent-watch/plugin-sdk";
import {
  createNormalizedSessionParser,
  discoverSessionRoots,
  getDefaultActivityScore,
  getFirstTextContent,
  getFirstToolCallFromContent,
  getStringValue,
  matchesSessionFile,
  watchJsonlSessionFilesByPolling,
  type SessionSource
} from "@agent-watch/plugin-sdk";

import { buildOpenClawSessionId, getOpenClawAgentId } from "./identity.js";

const DEFAULT_PATHS = ["~/.openclaw/agents", "~/.openclaw"];
const DEFAULT_SCAN_INTERVAL_MS = 2000;
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_FILES = 5000;
const SOURCE: SessionSource = "openclaw";
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);

function getMessage(record: Record<string, unknown>): Record<string, unknown> | undefined {
  return record.message && typeof record.message === "object" ? (record.message as Record<string, unknown>) : undefined;
}

function getOpenClawTool(record: Record<string, unknown>) {
  const message = getMessage(record);
  return getFirstToolCallFromContent(message?.content) ||
    (message?.name ? { name: getStringValue(message.name), detail: undefined } : undefined);
}

function getOpenClawText(record: Record<string, unknown>): string {
  const message = getMessage(record);
  return getFirstTextContent(message?.content) ||
    getStringValue(record.summary) ||
    getStringValue(record.message) ||
    getStringValue(record.text) ||
    getStringValue(record.content);
}

function getOpenClawRole(record: Record<string, unknown>): string | undefined {
  return getStringValue(getMessage(record)?.role) || undefined;
}

export const parseOpenClawRecord = createNormalizedSessionParser({
  source: "openclaw",
  defaultDisplayName: "OpenClaw",
  defaultSummary: "OpenClaw activity",
  getSessionId: ({ filePath, record }) => buildOpenClawSessionId(getOpenClawAgentId(filePath), filePath, record),
  getDisplayName: ({ filePath }) => getOpenClawAgentId(filePath) || "OpenClaw",
  getTimestamp: ({ record, fallbackTimestamp }) =>
    getStringValue(record.timestamp) ||
    getStringValue(record.created_at) ||
    getStringValue(record.createdAt) ||
    fallbackTimestamp,
  getEventType: ({ record }) => getOpenClawTool(record) && Array.isArray(getMessage(record)?.content)
    ? "tool_use"
    : getStringValue(record.event_type) || getStringValue(record.type) || "message",
  getStatus: ({ record }) => getStringValue(record.status) || "active",
  getSummary: ({ record }) =>
    getOpenClawTool(record)?.name ||
    getOpenClawText(record) ||
    "OpenClaw activity",
  getDetail: ({ record }) =>
    getOpenClawTool(record)?.detail ||
    getStringValue(getMessage(record)?.model) ||
    getOpenClawRole(record) ||
    getStringValue(record.detail) ||
    getStringValue(record.raw) ||
    undefined,
  getActivityScore: ({ eventType, record }) => getDefaultActivityScore(eventType, record.activityScore),
  getMeta: ({ filePath, record }) => {
    const agentId = getOpenClawAgentId(filePath) || undefined;
    return {
      filePath,
      agentId,
      groupKey: agentId,
      toolName:
        getOpenClawTool(record)?.name ||
        getStringValue(record.toolName) ||
        getStringValue(record.tool_name) ||
        undefined,
      role: getOpenClawRole(record),
      rawType: getStringValue(record.type),
      model: getStringValue(getMessage(record)?.model) || undefined
    };
  }
});

export class OpenClawWatchPlugin implements CollectorPlugin {
  id = "plugin-openclaw-watch";
  source = "openclaw";

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    return discoverSessionRoots(config, {
      envVar: "OPENCLAW_SESSION_ROOTS",
      defaultRoots: DEFAULT_PATHS,
      idPrefix: "openclaw-root"
    });
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const activeWindowMs = Number(process.env.OPENCLAW_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    const scanIntervalMs = Number(process.env.OPENCLAW_SCAN_INTERVAL_MS ?? DEFAULT_SCAN_INTERVAL_MS);
    const maxDepth = Number(process.env.OPENCLAW_SCAN_MAX_DEPTH ?? DEFAULT_MAX_DEPTH);
    const maxFiles = Number(process.env.OPENCLAW_SCAN_MAX_FILES ?? DEFAULT_MAX_FILES);
    return watchJsonlSessionFilesByPolling(root, ctx, {
      matchFile: MATCH_SESSION_FILE,
      activeWindowMs,
      parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
        parseOpenClawRecord(root.host, filePath, record, sequence, fallbackTimestamp),
      scanIntervalMs: Number.isFinite(scanIntervalMs) ? scanIntervalMs : DEFAULT_SCAN_INTERVAL_MS,
      maxDepth: Number.isFinite(maxDepth) ? maxDepth : DEFAULT_MAX_DEPTH,
      maxFiles: Number.isFinite(maxFiles) ? maxFiles : DEFAULT_MAX_FILES
    });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new OpenClawWatchPlugin();
}
