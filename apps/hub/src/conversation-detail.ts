import type { NormalizedEvent } from "@agent-watch/event-schema";
import type { RequestHandler } from "express";
import { computeStatus, type EntityState } from "./state.js";

export interface ConversationDetailQuery {
  source?: string;
  sessionId?: string;
  entityId?: string;
  limit?: number;
}

export interface ConversationDetailPayload {
  group: {
    source: string;
    sessionId?: string;
    entityId?: string;
  };
  matchedBy: "session" | "entity";
  current: EntityState;
  members: EntityState[];
  events: NormalizedEvent[];
}

export interface ConversationDetailContext {
  entities: Map<string, EntityState>;
  recentEvents: NormalizedEvent[];
  now: Date;
}

function safeLimit(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return 200;
  }
  return Math.min(Math.max(value, 1), 500);
}

function withComputedStatus(entity: EntityState, now: Date): EntityState {
  return { ...entity, currentStatus: computeStatus(entity, now) };
}

function newestFirst(a: EntityState, b: EntityState): number {
  return new Date(b.lastEventAt).getTime() - new Date(a.lastEventAt).getTime();
}

function resolveBySession(source: string, sessionId: string, ctx: ConversationDetailContext): ConversationDetailPayload | null {
  const members = [...ctx.entities.values()]
    .filter((entity) => entity.source === source && entity.sessionId === sessionId)
    .map((entity) => withComputedStatus(entity, ctx.now))
    .sort(newestFirst);

  if (members.length === 0) {
    return null;
  }

  const events = ctx.recentEvents.filter((event) => event.source === source && event.sessionId === sessionId);

  return {
    group: { source, sessionId },
    matchedBy: "session",
    current: members[0],
    members,
    events
  };
}

function resolveByEntity(entityId: string, ctx: ConversationDetailContext, limit: number): ConversationDetailPayload | null {
  const entity = ctx.entities.get(entityId);
  if (!entity) {
    return null;
  }

  if (entity.sessionId) {
    const members = [...ctx.entities.values()]
      .filter((entry) => entry.source === entity.source && entry.sessionId === entity.sessionId)
      .map((entry) => withComputedStatus(entry, ctx.now))
      .sort(newestFirst);

    const events = ctx.recentEvents.filter((event) => event.source === entity.source && event.sessionId === entity.sessionId).slice(-limit);

    return {
      group: { source: entity.source, sessionId: entity.sessionId, entityId },
      matchedBy: "entity",
      current: withComputedStatus(entity, ctx.now),
      members,
      events
    };
  }

  const events = ctx.recentEvents.filter((event) => event.entityId === entity.entityId).slice(-limit);
  return {
    group: { source: entity.source, entityId },
    matchedBy: "entity",
    current: withComputedStatus(entity, ctx.now),
    members: [withComputedStatus(entity, ctx.now)],
    events
  };
}

export function getConversationDetail(query: ConversationDetailQuery, ctx: ConversationDetailContext): ConversationDetailPayload | null {
  const limit = safeLimit(query.limit);

  if (query.sessionId) {
    if (!query.source) {
      return null;
    }
    const base = resolveBySession(query.source, query.sessionId, ctx);
    if (!base) {
      return null;
    }

    // Allow callers to anchor the "current" entity inside a session group if they provide entityId.
    if (query.entityId) {
      const anchored = base.members.find((member) => member.entityId === query.entityId);
      if (anchored) {
        return { ...base, group: { ...base.group, entityId: query.entityId }, current: anchored, events: base.events.slice(-limit) };
      }
    }

    return { ...base, events: base.events.slice(-limit) };
  }

  if (!query.entityId) {
    return null;
  }

  return resolveByEntity(query.entityId, ctx, limit);
}

export function createConversationDetailHandler(opts: { entities: Map<string, EntityState>; recentEvents: NormalizedEvent[] }): RequestHandler {
  return async (req, res) => {
    const source = typeof req.query.source === "string" ? req.query.source : undefined;
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const entityId = typeof req.query.entityId === "string" ? req.query.entityId : undefined;
    const limit = safeLimit(req.query.limit);

    if (sessionId && !source) {
      res.status(400).json({ error: "missing_source" });
      return;
    }
    if (!sessionId && !entityId) {
      res.status(400).json({ error: "missing_lookup_key" });
      return;
    }

    const detail = getConversationDetail(
      { source, sessionId, entityId, limit },
      {
        entities: opts.entities,
        recentEvents: opts.recentEvents,
        now: new Date()
      }
    );

    if (!detail) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    res.json(detail);
  };
}
