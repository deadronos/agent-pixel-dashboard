import type { NormalizedEvent } from "@agent-watch/event-schema";

export type EntityStatus = "active" | "idle" | "sleepy" | "dormant" | "done" | "error";

export interface EntityState {
  entityId: string;
  source: string;
  sourceHost: string;
  displayName: string;
  entityKind: string;
  sessionId?: string;
  parentEntityId?: string | null;
  groupKey?: string;
  currentStatus: EntityStatus;
  lastEventAt: string;
  lastSummary?: string;
  activityScore: number;
  recentEvents: string[];
}

const ACTIVE_WINDOW_MS = 10_000;
const IDLE_WINDOW_MS = 30_000;
const SLEEPY_WINDOW_MS = 90_000;
const DORMANT_WINDOW_MS = 300_000;
const MAX_RECENT_EVENTS = 25;
const ENTITY_EXPIRE_MS = 3_600_000; // 1 hour for done/error entities

export function computeStatus(state: Pick<EntityState, "lastEventAt" | "currentStatus">, now: Date): EntityStatus {
  if (state.currentStatus === "done" || state.currentStatus === "error") {
    return state.currentStatus;
  }

  const ageMs = now.getTime() - new Date(state.lastEventAt).getTime();
  if (ageMs <= ACTIVE_WINDOW_MS) {
    return "active";
  }
  if (ageMs <= IDLE_WINDOW_MS) {
    return "idle";
  }
  if (ageMs <= SLEEPY_WINDOW_MS) {
    return "sleepy";
  }
  if (ageMs <= DORMANT_WINDOW_MS) {
    return "dormant";
  }
  return "dormant";
}

export function expireEntities(entities: Map<string, EntityState>, now: Date): void {
  const cutoff = now.getTime() - ENTITY_EXPIRE_MS;
  for (const [entityId, entity] of entities) {
    if (entity.currentStatus === "done" || entity.currentStatus === "error") {
      const entityTime = new Date(entity.lastEventAt).getTime();
      if (entityTime < cutoff) {
        entities.delete(entityId);
      }
    }
  }
}

function statusFromEvent(event: NormalizedEvent): EntityStatus {
  if (event.eventType === "error") {
    return "error";
  }
  if (event.eventType === "session_finished" || event.eventType === "session_archived") {
    return "done";
  }
  return "active";
}

export function applyEvent(previous: EntityState | undefined, event: NormalizedEvent): EntityState {
  const status = statusFromEvent(event);
  const recentEvents = previous ? [...previous.recentEvents, event.eventId].slice(-MAX_RECENT_EVENTS) : [event.eventId];
  const groupKey = typeof event.meta?.groupKey === "string" ? event.meta.groupKey : previous?.groupKey;

  return {
    entityId: event.entityId,
    source: event.source,
    sourceHost: event.sourceHost,
    displayName: event.displayName,
    entityKind: event.entityKind,
    sessionId: event.sessionId,
    parentEntityId: event.parentEntityId,
    groupKey,
    currentStatus: status,
    lastEventAt: event.timestamp,
    lastSummary: event.summary ?? previous?.lastSummary,
    activityScore: event.activityScore ?? previous?.activityScore ?? 0.5,
    recentEvents
  };
}
