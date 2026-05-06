import {
  normalizeDashboardEntity,
  parseNormalizedEvent,
  parseIngestBatchBody,
  type HubStateResponse,
  type NormalizedEvent
} from "@agent-watch/event-schema";

import { RecentEventBuffer } from "./recent-event-buffer.js";
import { applyEvent, expireEntities, type EntityState } from "./state.js";

const MAX_RECENT_EVENTS = 1000;

export interface IngestEventsResult {
  accepted: NormalizedEvent[];
  rejected: number;
}

export class HubStore {
  private readonly entities = new Map<string, EntityState>();
  private readonly recentEvents = new RecentEventBuffer(MAX_RECENT_EVENTS);

  get entityCount(): number {
    return this.entities.size;
  }

  get recentEventCount(): number {
    return this.recentEvents.size;
  }

  getEntityMap(): Map<string, EntityState> {
    return new Map(this.entities);
  }

  getRecentEventsSnapshot(): NormalizedEvent[] {
    return this.recentEvents.snapshot();
  }

  ingestBatch(input: unknown): IngestEventsResult {
    const body = parseIngestBatchBody(input);
    const accepted: NormalizedEvent[] = [];
    let rejected = 0;

    for (const entry of body.events) {
      try {
        const event = parseNormalizedEvent(entry);
        if (!this.recentEvents.add(event)) {
          rejected++;
          continue;
        }
        accepted.push(event);
        this.entities.set(event.entityId, applyEvent(this.entities.get(event.entityId), event));
      } catch {
        rejected++;
      }
    }

    return { accepted, rejected };
  }

  expire(now = new Date()): void {
    expireEntities(this.entities, now);
  }

  getState(includeDormant: boolean, now = new Date(), limit?: number, offset = 0): HubStateResponse {
    let state = [...this.entities.values()].map((entity) => normalizeDashboardEntity(entity, now));
    if (!includeDormant) {
      state = state.filter(
        (entity) =>
          entity.currentStatus === "active" ||
          entity.currentStatus === "idle" ||
          entity.currentStatus === "sleepy"
      );
    }
    const total = state.length;
    const paginated = limit !== undefined ? state.slice(offset, offset + limit) : state;
    return {
      entities: paginated,
      total,
      offset,
      limit: limit ?? total
    };
  }
}
