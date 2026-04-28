import type { NormalizedEvent, ToolRunMeta } from '@agent-watch/event-schema';
import type {
  CollectorPlugin,
  DiscoveredSessionRoot,
  PluginContext,
  WatchContext,
  WatchHandle,
} from '@agent-watch/plugin-sdk';
import {
  asArray,
  asRecord,
  buildNormalizedSessionEvent,
  createNormalizedSessionParser,
  discoverSessionRoots,
  getDefaultActivityScore,
  getFirstTextContent,
  getFirstToolCallFromContent,
  getStringValue,
  matchesSessionFile,
  watchJsonlSessionFilesByPolling,
  type SessionSource,
} from '@agent-watch/plugin-sdk';

import { buildOpenClawSessionId, getOpenClawAgentId } from './identity.js';

const DEFAULT_PATHS = ['~/.openclaw/agents'];
const DEFAULT_SCAN_INTERVAL_MS = 2000;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_FILES = 5000;
const SOURCE: SessionSource = 'openclaw';
const MATCH_SESSION_FILE = (filePath: string): boolean => matchesSessionFile(SOURCE, filePath);
const TOOL_START_TYPES = new Set([
  'tool_use',
  'toolUse',
  'toolcall',
  'toolCall',
  'tool_call',
  'function_call',
  'functionCall',
  'command_execution',
  'tool_invocation',
]);
const TOOL_END_TYPES = new Set([
  'tool_result',
  'toolResult',
  'toolresult',
  'tool_result_error',
  'toolResultError',
  'function_call_output',
  'functionCallOutput',
  'tool_end',
]);

function getMessage(record: Record<string, unknown>): Record<string, unknown> | undefined {
  return record.message && typeof record.message === 'object'
    ? (record.message as Record<string, unknown>)
    : undefined;
}

function getOpenClawTool(record: Record<string, unknown>) {
  const message = getMessage(record);
  return (
    getFirstToolCallFromContent(message?.content) ||
    (message?.name ? { name: getStringValue(message.name), detail: undefined } : undefined)
  );
}

function parseJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function getRecordInput(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  if (record) {
    return record;
  }

  return typeof value === 'string' ? parseJsonRecord(value) : undefined;
}

function getFirstMatchingContentItem(
  record: Record<string, unknown>,
  types: ReadonlySet<string>
): Record<string, unknown> | undefined {
  for (const item of asArray(getMessage(record)?.content)) {
    const itemRecord = asRecord(item);
    const type = getStringValue(itemRecord?.type);
    if (itemRecord && types.has(type)) {
      return itemRecord;
    }
  }

  return undefined;
}

function getToolRunId(
  record: Record<string, unknown>,
  toolItem: Record<string, unknown> | undefined,
  sequence: number
): string {
  const message = getMessage(record);
  const id =
    getStringValue(toolItem?.id) ||
    getStringValue(toolItem?.tool_use_id) ||
    getStringValue(toolItem?.toolCallId) ||
    getStringValue(record.tool_use_id) ||
    getStringValue(record.toolCallId) ||
    getStringValue(record.tool_call_id) ||
    getStringValue(record.call_id) ||
    getStringValue(message?.id) ||
    getStringValue(message?.tool_use_id) ||
    getStringValue(message?.toolCallId) ||
    '';

  return id.trim() || `seq-${sequence}`;
}

function getToolInputs(
  record: Record<string, unknown>,
  toolItem: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  const fn = asRecord(toolItem?.function) ?? asRecord(record.function);
  return (
    getRecordInput(toolItem?.input) ??
    getRecordInput(toolItem?.arguments) ??
    getRecordInput(toolItem?.args) ??
    getRecordInput(record.input) ??
    getRecordInput(record.arguments) ??
    getRecordInput(record.args) ??
    getRecordInput(fn?.arguments)
  );
}

function getToolName(
  record: Record<string, unknown>,
  toolItem: Record<string, unknown> | undefined
): string {
  const fn = asRecord(toolItem?.function) ?? asRecord(record.function);
  const message = getMessage(record);
  return (
    getStringValue(toolItem?.name) ||
    getStringValue(toolItem?.tool) ||
    getStringValue(toolItem?.tool_name) ||
    getStringValue(fn?.name) ||
    getStringValue(record.toolName) ||
    getStringValue(record.tool_name) ||
    getStringValue(record.name) ||
    getStringValue(message?.name) ||
    getStringValue(message?.toolName) ||
    getStringValue(message?.tool_name) ||
    'tool'
  );
}

function getToolOutput(
  record: Record<string, unknown>,
  toolItem: Record<string, unknown> | undefined
): string | undefined {
  const message = getMessage(record);
  const output =
    toolItem?.content ?? toolItem?.output ?? record.output ?? record.result ?? message?.content;
  return (
    getStringValue(output) ||
    getFirstTextContent(output) ||
    getStringValue(record.detail) ||
    undefined
  );
}

function getDurationMs(record: Record<string, unknown>): number | undefined {
  const value = record.durationMs ?? record.duration_ms;
  return typeof value === 'number' ? value : undefined;
}

function getExitCode(record: Record<string, unknown>): number | undefined {
  const value = record.exitCode ?? record.exit_code;
  return typeof value === 'number' ? value : undefined;
}

function isToolEndRecord(record: Record<string, unknown>): boolean {
  const type = getStringValue(record.type) || getStringValue(record.event_type);
  const messageRole = getStringValue(getMessage(record)?.role);
  return (
    TOOL_END_TYPES.has(type) ||
    messageRole === 'tool' ||
    messageRole === 'toolResult' ||
    Boolean(getFirstMatchingContentItem(record, TOOL_END_TYPES))
  );
}

function isToolStartRecord(record: Record<string, unknown>): boolean {
  const type = getStringValue(record.type) || getStringValue(record.event_type);
  return (
    TOOL_START_TYPES.has(type) || Boolean(getFirstMatchingContentItem(record, TOOL_START_TYPES))
  );
}

function buildToolRunEntityId(
  sessionId: string,
  record: Record<string, unknown>,
  toolItem: Record<string, unknown> | undefined,
  sequence: number
): string {
  return `${SOURCE}:tool-run:${sessionId}:${getToolRunId(record, toolItem, sequence)}`;
}

function buildOpenClawToolRunEvent(
  sessionEvent: NormalizedEvent,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
): NormalizedEvent | undefined {
  const startItem = getFirstMatchingContentItem(record, TOOL_START_TYPES);
  const endItem = getFirstMatchingContentItem(record, TOOL_END_TYPES);
  const endRecord = isToolEndRecord(record);
  const startRecord = !endRecord && isToolStartRecord(record);

  if (!startRecord && !endRecord) {
    return undefined;
  }

  const toolItem = endRecord ? endItem : startItem;
  const toolName = getToolName(record, toolItem);
  const status = endRecord
    ? getStringValue(record.status) === 'error'
      ? 'error'
      : 'done'
    : 'active';
  const output = endRecord ? getToolOutput(record, toolItem) : undefined;
  const inputs = startRecord ? getToolInputs(record, toolItem) : undefined;
  const meta: ToolRunMeta = {
    toolName,
    ...(inputs ? { inputs } : {}),
    ...(output ? { output } : {}),
    ...(getExitCode(record) !== undefined ? { exitCode: getExitCode(record) } : {}),
    ...(getDurationMs(record) !== undefined ? { durationMs: getDurationMs(record) } : {}),
  };

  return buildNormalizedSessionEvent({
    source: SOURCE,
    sourceHost: sessionEvent.sourceHost,
    filePath,
    sessionId: sessionEvent.sessionId,
    entityId: buildToolRunEntityId(
      sessionEvent.sessionId ?? sessionEvent.entityId,
      record,
      toolItem,
      sequence
    ),
    parentEntityId: sessionEvent.entityId,
    entityKind: 'tool-run',
    displayName: toolName,
    timestamp: sessionEvent.timestamp || fallbackTimestamp,
    eventType: endRecord ? 'tool_end' : 'tool_start',
    status,
    summary: endRecord ? `Finished ${toolName}` : `Running ${toolName}...`,
    defaultSummary: endRecord ? 'Tool finished' : 'Tool started',
    detail: output,
    activityScore: endRecord ? 0.45 : 0.95,
    sequence,
    meta,
  });
}

function getOpenClawText(record: Record<string, unknown>): string {
  const message = getMessage(record);
  return (
    getFirstTextContent(message?.content) ||
    getStringValue(record.summary) ||
    getStringValue(record.message) ||
    getStringValue(record.text) ||
    getStringValue(record.content)
  );
}

function getOpenClawRole(record: Record<string, unknown>): string | undefined {
  return getStringValue(getMessage(record)?.role) || undefined;
}

export const parseOpenClawRecord = createNormalizedSessionParser({
  source: 'openclaw',
  defaultDisplayName: 'OpenClaw',
  defaultSummary: 'OpenClaw activity',
  getSessionId: ({ filePath, record }) =>
    buildOpenClawSessionId(getOpenClawAgentId(filePath), filePath, record),
  getDisplayName: ({ filePath }) => getOpenClawAgentId(filePath) || 'OpenClaw',
  getTimestamp: ({ record, fallbackTimestamp }) =>
    getStringValue(record.timestamp) ||
    getStringValue(record.created_at) ||
    getStringValue(record.createdAt) ||
    fallbackTimestamp,
  getEventType: ({ record }) =>
    getOpenClawTool(record) && Array.isArray(getMessage(record)?.content)
      ? 'tool_use'
      : getStringValue(record.event_type) || getStringValue(record.type) || 'message',
  getStatus: ({ record }) => getStringValue(record.status) || 'active',
  getSummary: ({ record }) =>
    getOpenClawTool(record)?.name || getOpenClawText(record) || 'OpenClaw activity',
  getDetail: ({ record }) =>
    getOpenClawTool(record)?.detail ||
    getStringValue(getMessage(record)?.model) ||
    getOpenClawRole(record) ||
    getStringValue(record.detail) ||
    getStringValue(record.raw) ||
    undefined,
  getActivityScore: ({ eventType, record }) =>
    getDefaultActivityScore(eventType, record.activityScore),
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
      model: getStringValue(getMessage(record)?.model) || undefined,
    };
  },
});

export function parseOpenClawRecordEvents(
  sourceHost: string,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
): NormalizedEvent[] {
  const sessionEvent = parseOpenClawRecord(
    sourceHost,
    filePath,
    record,
    sequence,
    fallbackTimestamp
  );
  const toolEvent = buildOpenClawToolRunEvent(
    sessionEvent,
    filePath,
    record,
    sequence,
    fallbackTimestamp
  );
  return toolEvent ? [sessionEvent, toolEvent] : [sessionEvent];
}

export class OpenClawWatchPlugin implements CollectorPlugin {
  id = 'plugin-openclaw-watch';
  source = 'openclaw';

  async discover(config: PluginContext): Promise<DiscoveredSessionRoot[]> {
    return discoverSessionRoots(config, {
      envVar: 'OPENCLAW_SESSION_ROOTS',
      defaultRoots: DEFAULT_PATHS,
      idPrefix: 'openclaw-root',
    });
  }

  async watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle> {
    const activeWindowMs = Number(process.env.OPENCLAW_ACTIVE_WINDOW_MS ?? 2 * 60 * 1000);
    const scanIntervalMs = Number(
      process.env.OPENCLAW_SCAN_INTERVAL_MS ?? DEFAULT_SCAN_INTERVAL_MS
    );
    const maxDepth = Number(process.env.OPENCLAW_SCAN_MAX_DEPTH ?? DEFAULT_MAX_DEPTH);
    const maxFiles = Number(process.env.OPENCLAW_SCAN_MAX_FILES ?? DEFAULT_MAX_FILES);
    return watchJsonlSessionFilesByPolling(root, ctx, {
      matchFile: MATCH_SESSION_FILE,
      activeWindowMs,
      parseRecord: (filePath, record, sequence, fallbackTimestamp) =>
        parseOpenClawRecordEvents(root.host, filePath, record, sequence, fallbackTimestamp),
      scanIntervalMs: Number.isFinite(scanIntervalMs) ? scanIntervalMs : DEFAULT_SCAN_INTERVAL_MS,
      maxDepth: Number.isFinite(maxDepth) ? maxDepth : DEFAULT_MAX_DEPTH,
      maxFiles: Number.isFinite(maxFiles) ? maxFiles : DEFAULT_MAX_FILES,
    });
  }
}

export default function createPlugin(): CollectorPlugin {
  return new OpenClawWatchPlugin();
}
