import {
  resolveEntityStatus,
  type DashboardEntity,
  type EntityStatus,
  type NormalizedEvent
} from "@agent-watch/event-schema";

export interface EntityState extends DashboardEntity {
  recentEvents: string[];
}

const MAX_RECENT_EVENTS = 25;
const ENTITY_EXPIRE_MS = 3_600_000; // 1 hour for done/error entities

export function computeStatus(state: Pick<EntityState, "lastEventAt" | "currentStatus">, now: Date): EntityStatus {
  return resolveEntityStatus(state.currentStatus, state.lastEventAt, now);
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
  const recentEvents = [...(previous?.recentEvents ?? []), event.eventId].slice(-MAX_RECENT_EVENTS);
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
