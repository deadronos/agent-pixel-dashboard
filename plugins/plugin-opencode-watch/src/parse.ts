import path from "node:path";

import { buildNormalizedSessionEvent, getStringValue, type SessionSource } from "@agent-watch/plugin-sdk";

import type { OpenCodeDbSessionRow } from "./db.js";

export const SOURCE: SessionSource = "opencode";

function getRecordObject(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asIsoTimestamp(value: unknown, fallbackTimestamp: string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return fallbackTimestamp;
}

export function normalizeModel(model: unknown, provider?: unknown): string | undefined {
  if (typeof model !== "string" || model.trim().length === 0) {
    return undefined;
  }
  if (typeof provider === "string" && provider.trim().length > 0 && !model.includes("/")) {
    return `${provider}/${model}`;
  }
  return model;
}

function projectFromRecord(record: Record<string, unknown>, fallback: string): string {
  const project = getRecordObject(record, "project");
  return getStringValue(project?.path) ||
    getStringValue(record.cwd) ||
    getStringValue(record.path) ||
    getStringValue(record.directory) ||
    fallback;
}

export function parseSessionModel(
  modelJson: string | null | undefined,
  fallbackModel: string | null | undefined,
  fallbackProvider: string | null | undefined
): string | undefined {
  if (typeof modelJson === "string" && modelJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(modelJson) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        const model = normalizeModel(record.id, record.providerID);
        if (model) {
          return model;
        }
      }
    } catch {
      // Invalid JSON falls back to message-derived model metadata.
    }
  }
  return normalizeModel(fallbackModel ?? undefined, fallbackProvider ?? undefined);
}

export function parseOpenCodeSessionFile(
  sourceHost: string,
  filePath: string,
  record: Record<string, unknown>,
  sequence: number,
  fallbackTimestamp: string
) {
  const sessionId = getStringValue(record.id) || path.basename(filePath, ".json");
  const project = projectFromRecord(record, path.basename(path.dirname(filePath)));
  const time = getRecordObject(record, "time");
  const model = normalizeModel(record.model);

  return buildNormalizedSessionEvent({
    source: SOURCE,
    sourceHost,
    filePath,
    sessionId,
    entityId: `${SOURCE}:session:${sessionId}`,
    displayName: "OpenCode",
    timestamp: asIsoTimestamp(time?.updated ?? record.updatedAt ?? record.updated, fallbackTimestamp),
    eventType: "session_update",
    summary: getStringValue(record.title) || "OpenCode activity",
    defaultSummary: "OpenCode activity",
    detail: project,
    activityScore: 0.7,
    sequence,
    meta: {
      filePath,
      groupKey: project,
      model
    }
  });
}

export function parseOpenCodeDbEvent(sourceHost: string, row: OpenCodeDbSessionRow, sequence: number) {
  const project = row.directory || row.project_id || row.id;
  const model = parseSessionModel(row.model, row.modelID, row.providerID);

  return buildNormalizedSessionEvent({
    source: SOURCE,
    sourceHost,
    filePath: `opencode-db:${row.id}`,
    sessionId: row.id,
    entityId: `${SOURCE}:session:${row.id}`,
    parentEntityId: row.parent_id ? `${SOURCE}:session:${row.parent_id}` : null,
    displayName: "OpenCode",
    timestamp: new Date(row.time_updated).toISOString(),
    eventType: "session_update",
    summary: row.lastMessage || row.lastTool || row.title || "OpenCode activity",
    defaultSummary: "OpenCode activity",
    detail: row.lastToolInput || project,
    activityScore: row.lastTool ? 0.85 : 0.75,
    sequence,
    meta: {
      filePath: `opencode-db:${row.id}`,
      groupKey: project,
      model,
      toolName: row.lastTool || undefined
    }
  });
}
