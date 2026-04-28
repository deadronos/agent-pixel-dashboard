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
const ENTITY_GLOBAL_EXPIRE_MS = 24 * 3_600_000; // 24 hours for abandoned live entities

export function computeStatus(state: Pick<EntityState, "lastEventAt" | "currentStatus">, now: Date): EntityStatus {
  return resolveEntityStatus(state.currentStatus, state.lastEventAt, now);
}

export function expireEntities(entities: Map<string, EntityState>, now: Date): void {
  const terminalCutoff = now.getTime() - ENTITY_EXPIRE_MS;
  const globalCutoff = now.getTime() - ENTITY_GLOBAL_EXPIRE_MS;
  for (const [entityId, entity] of entities) {
    const entityTime = new Date(entity.lastEventAt).getTime();
    if (entityTime < globalCutoff) {
      entities.delete(entityId);
      continue;
    }

    if (entity.currentStatus === "done" || entity.currentStatus === "error") {
      if (entityTime < terminalCutoff) {
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
