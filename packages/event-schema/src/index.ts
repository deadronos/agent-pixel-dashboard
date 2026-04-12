import crypto from "node:crypto";

import { z } from "zod";

export const EntityKindSchema = z.enum(["session", "subagent", "tool-run"]);
export const entityStatusValues = ["active", "idle", "sleepy", "dormant", "done", "error"] as const;
export const EntityStatusSchema = z.enum(entityStatusValues);
export type EntityStatus = z.infer<typeof EntityStatusSchema>;

export const LIVE_STATUS_WINDOWS_MS = {
  active: 10_000,
  idle: 30_000,
  sleepy: 90_000,
  dormant: 300_000
} as const;

export const NormalizedEventSchema = z.object({
  eventId: z.string().min(1),
  timestamp: z.string().datetime({ offset: true }),
  source: z.string().min(1),
  sourceHost: z.string().min(1),
  entityId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  parentEntityId: z.string().nullable().optional(),
  entityKind: EntityKindSchema,
  displayName: z.string().min(1),
  eventType: z.string().min(1),
  status: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  detail: z.string().min(1).optional(),
  activityScore: z.number().min(0).max(1).optional(),
  turnId: z.string().min(1).optional(),
  sequence: z.number().int().nonnegative().optional(),
  meta: z.record(z.unknown()).optional()
});

export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;

export const DashboardEntitySchema = z.object({
  entityId: z.string().min(1),
  source: z.string().min(1),
  sourceHost: z.string().min(1),
  displayName: z.string().min(1),
  entityKind: z.string().min(1),
  currentStatus: EntityStatusSchema,
  lastEventAt: z.string().datetime({ offset: true }),
  lastSummary: z.string().min(1).optional(),
  activityScore: z.number().min(0).max(1),
  sessionId: z.string().min(1).optional(),
  parentEntityId: z.string().nullable().optional(),
  groupKey: z.string().min(1).optional(),
  recentEvents: z.array(z.string().min(1)).optional()
});

export type DashboardEntity = z.infer<typeof DashboardEntitySchema>;

export const HubStateResponseSchema = z.object({
  entities: z.array(DashboardEntitySchema).default([])
});

export type HubStateResponse = z.infer<typeof HubStateResponseSchema>;

export const HubHelloMessageSchema = z.object({
  type: z.literal("hello"),
  entities: z.number().int().nonnegative()
});

export type HubHelloMessage = z.infer<typeof HubHelloMessageSchema>;

export const HubEventsMessageSchema = z.object({
  type: z.literal("events"),
  events: z.array(NormalizedEventSchema)
});

export type HubEventsMessage = z.infer<typeof HubEventsMessageSchema>;

export const HubMessageSchema = z.union([HubHelloMessageSchema, HubEventsMessageSchema]);

export type HubMessage = z.infer<typeof HubMessageSchema>;

export function parseNormalizedEvent(input: unknown): NormalizedEvent {
  return NormalizedEventSchema.parse(input);
}

export function parseHubStateResponse(input: unknown): HubStateResponse {
  return HubStateResponseSchema.parse(input);
}

export function parseHubMessage(input: unknown): HubMessage {
  return HubMessageSchema.parse(input);
}

export function makeDeterministicEventId(input: {
  source: string;
  entityId: string;
  timestamp: string;
  eventType: string;
  sequence?: number;
  detail?: string;
}): string {
  const key = `${input.source}|${input.entityId}|${input.timestamp}|${input.eventType}|${input.sequence ?? ""}|${input.detail ?? ""}`;
  const digest = crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
  return `evt_${digest}`;
}

export function getStatusFromTimestamp(timestamp: string, now = new Date()): EntityStatus {
  const ageMs = now.getTime() - new Date(timestamp).getTime();
  if (ageMs <= LIVE_STATUS_WINDOWS_MS.active) {
    return "active";
  }
  if (ageMs <= LIVE_STATUS_WINDOWS_MS.idle) {
    return "idle";
  }
  if (ageMs <= LIVE_STATUS_WINDOWS_MS.sleepy) {
    return "sleepy";
  }
  if (ageMs <= LIVE_STATUS_WINDOWS_MS.dormant) {
    return "dormant";
  }
  return "dormant";
}

export function resolveEntityStatus(
  currentStatus: EntityStatus | undefined,
  lastEventAt: string,
  now = new Date()
): EntityStatus {
  if (currentStatus === "done" || currentStatus === "error") {
    return currentStatus;
  }

  return getStatusFromTimestamp(lastEventAt, now);
}
