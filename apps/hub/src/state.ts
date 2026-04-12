import {
  projectEntityEvent,
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

export function applyEvent(previous: EntityState | undefined, event: NormalizedEvent): EntityState {
  const next = projectEntityEvent(previous, event, { maxRecentEvents: MAX_RECENT_EVENTS });
  return {
    ...next,
    recentEvents: next.recentEvents ?? []
  };
}
