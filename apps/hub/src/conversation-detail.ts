import type { ConversationDetailPayload, NormalizedEvent } from "@agent-watch/event-schema";
import type { RequestHandler } from "express";

import { computeStatus, type EntityState } from "./state.js";

export interface ConversationDetailQuery {
  source?: string;
  sessionId?: string;
  entityId?: string;
  limit?: unknown;
}

export interface ConversationDetailContext {
  entities: Map<string, EntityState>;
  recentEvents: NormalizedEvent[];
  now: Date;
}

function withComputedStatus(entity: EntityState, now: Date): EntityState {
  return { ...entity, currentStatus: computeStatus(entity, now) };
}

function clampLimit(raw: unknown): number {
  const normalized = Array.isArray(raw) ? raw[0] : raw;
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return 200;
  }
  return Math.min(Math.max(value, 1), 500);
}

function normalizeQueryText(raw: unknown): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function timestampToMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestFirst(a: EntityState, b: EntityState): number {
  return timestampToMs(b.lastEventAt) - timestampToMs(a.lastEventAt);
}

function buildSessionMembers(source: string, sessionId: string, ctx: ConversationDetailContext): EntityState[] {
  return [...ctx.entities.values()]
    .filter((entity) => entity.source === source && entity.sessionId === sessionId)
    .map((entity) => withComputedStatus(entity, ctx.now))
    .sort(newestFirst);
}

function buildSessionEvents(
  source: string,
  sessionId: string,
  ctx: ConversationDetailContext,
  limit: number
): NormalizedEvent[] {
  return ctx.recentEvents
    .filter((event) => event.source === source && event.sessionId === sessionId)
    .sort((left, right) => timestampToMs(right.timestamp) - timestampToMs(left.timestamp))
    .slice(0, limit);
}

function resolveBySession(
  source: string,
  sessionId: string,
  ctx: ConversationDetailContext,
  limit: number,
  currentEntityId?: string
): ConversationDetailPayload | null {
  const members = buildSessionMembers(source, sessionId, ctx);

  if (members.length === 0) {
    return null;
  }

  const events = buildSessionEvents(source, sessionId, ctx, limit);
  const representative = pickRepresentative(members);
  const current =
    (currentEntityId ? members.find((member) => member.entityId === currentEntityId) : undefined) ??
    representative;

  return {
    groupId: `${source}|${sessionId}`,
    group: { source, sessionId },
    matchedBy: "session",
    current,
    representative,
    members,
    recentEvents: events
  };
}

function resolveByEntity(entityId: string, ctx: ConversationDetailContext, limit: number): ConversationDetailPayload | null {
  const entity = ctx.entities.get(entityId);
  if (!entity) {
    return null;
  }

  if (entity.sessionId) {
    const base = resolveBySession(entity.source, entity.sessionId, ctx, limit, entity.entityId);
    return base ? { ...base, group: { ...base.group, entityId: base.current.entityId } } : null;
  }

  const events = ctx.recentEvents
    .filter((event) => event.entityId === entity.entityId)
    .sort((left, right) => timestampToMs(right.timestamp) - timestampToMs(left.timestamp))
    .slice(0, limit);
  const representative = withComputedStatus(entity, ctx.now);
  return {
    groupId: entity.entityId,
    group: { source: entity.source, entityId },
    matchedBy: "entity",
    current: representative,
    representative,
    members: [representative],
    recentEvents: events
  };
}

export function getConversationDetail(query: ConversationDetailQuery, ctx: ConversationDetailContext): ConversationDetailPayload | null {
  const limit = clampLimit(query.limit);
  const source = normalizeQueryText(query.source);
  const sessionId = normalizeQueryText(query.sessionId);

  if (sessionId) {
    if (!source) {
      return null;
    }
    const anchorEntityId = normalizeQueryText(query.entityId);
    const base = resolveBySession(source, sessionId, ctx, limit, anchorEntityId);
    if (!base) {
      return null;
    }

    // Allow callers to anchor the "current" entity inside a session group if they provide entityId.
    if (anchorEntityId) {
      const anchored = base.members.find((member) => member.entityId === anchorEntityId);
      if (anchored) {
        return { ...base, group: { ...base.group, entityId: anchored.entityId }, current: anchored };
      }
    }

    return base;
  }

  const entityId = normalizeQueryText(query.entityId);
  if (!entityId) {
    return null;
  }

  return resolveByEntity(entityId, ctx, limit);
}

type RecentEventsSource = NormalizedEvent[] | (() => NormalizedEvent[]);

function resolveRecentEvents(source: RecentEventsSource): NormalizedEvent[] {
  return typeof source === "function" ? source() : source;
}

export function createConversationDetailHandler(opts: { entities: Map<string, EntityState>; recentEvents: RecentEventsSource }): RequestHandler {
  return async (req, res) => {
    const source = normalizeQueryText(req.query.source);
    const sessionId = normalizeQueryText(req.query.sessionId);
    const entityId = normalizeQueryText(req.query.entityId);

    if (sessionId && !source) {
      res.status(400).json({ error: "missing_source" });
      return;
    }
    if (!sessionId && !entityId) {
      res.status(400).json({ error: "missing_lookup_key" });
      return;
    }

    const detail = getConversationDetail(
      { source, sessionId, entityId, limit: req.query.limit },
      {
        entities: opts.entities,
        recentEvents: resolveRecentEvents(opts.recentEvents),
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

function pickRepresentative(members: readonly EntityState[]): EntityState {
  return [...members].sort((left, right) => {
    if (left.entityKind === "session" && right.entityKind !== "session") {
      return -1;
    }
    if (right.entityKind === "session" && left.entityKind !== "session") {
      return 1;
    }

    return timestampToMs(right.lastEventAt) - timestampToMs(left.lastEventAt);
  })[0];
}
