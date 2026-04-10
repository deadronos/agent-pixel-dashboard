import { describe, expect, it } from "vitest";
import type { NormalizedEvent } from "@agent-watch/event-schema";
import { applyEvent } from "./state.js";
import { createConversationDetailHandler, getConversationDetail } from "./conversation-detail.js";

function sampleEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    eventId: "evt_1",
    timestamp: "2026-04-09T20:15:31.000Z",
    source: "codex",
    sourceHost: "workstation",
    entityId: "codex:session:abc123",
    sessionId: "abc123",
    parentEntityId: null,
    entityKind: "session",
    displayName: "Codex",
    eventType: "message",
    status: "active",
    summary: "Reading files",
    detail: "Scanning src",
    activityScore: 0.8,
    sequence: 5,
    meta: {},
    ...overrides
  };
}

function createMockRes() {
  const res: {
    statusCode: number;
    body: unknown;
    status: (code: number) => typeof res;
    json: (body: unknown) => void;
  } = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    }
  };
  return res;
}

describe("conversation detail lookup", () => {
  it("returns null when session group does not exist", () => {
    const entities = new Map();
    const events: NormalizedEvent[] = [];
    const detail = getConversationDetail(
      { source: "codex", sessionId: "missing" },
      { entities, recentEvents: events, now: new Date("2026-04-09T20:15:31.000Z") }
    );
    expect(detail).toBeNull();
  });

  it("looks up by source + sessionId when provided", () => {
    const sessionEntity = applyEvent(undefined, sampleEvent({ entityId: "codex:session:abc123", eventId: "evt_s1" }));
    const toolEntity = applyEvent(
      undefined,
      sampleEvent({
        entityId: "codex:tool:abc123:ls",
        entityKind: "tool-run",
        displayName: "ls",
        eventId: "evt_t1",
        timestamp: "2026-04-09T20:15:40.000Z"
      })
    );

    const entities = new Map<string, typeof sessionEntity>([
      [sessionEntity.entityId, sessionEntity],
      [toolEntity.entityId, toolEntity]
    ]);

    const recentEvents: NormalizedEvent[] = [
      sampleEvent({ entityId: sessionEntity.entityId, eventId: "evt_s0", timestamp: "2026-04-09T20:15:30.000Z" }),
      sampleEvent({ entityId: toolEntity.entityId, eventId: "evt_t0", timestamp: "2026-04-09T20:15:35.000Z", entityKind: "tool-run", displayName: "ls" }),
      sampleEvent({ entityId: "codex:session:other", sessionId: "other", eventId: "evt_other", timestamp: "2026-04-09T20:15:36.000Z" })
    ];

    const detail = getConversationDetail(
      { source: "codex", sessionId: "abc123", limit: 10 },
      { entities, recentEvents, now: new Date("2026-04-09T20:15:45.000Z") }
    );

    expect(detail).not.toBeNull();
    expect(detail?.members).toHaveLength(2);
    expect(detail?.recentEvents.map((e) => e.eventId)).toEqual(["evt_t0", "evt_s0"]);
    expect(detail?.current.entityId).toBe(sessionEntity.entityId);
    expect(detail?.representative.entityId).toBe(sessionEntity.entityId);
    expect(detail?.groupId).toBe("codex|abc123");
  });

  it("falls back to entityId lookup when sessionId is missing", () => {
    const sessionEntity = applyEvent(undefined, sampleEvent({ entityId: "codex:session:abc123", eventId: "evt_s1" }));
    const toolEntity = applyEvent(
      undefined,
      sampleEvent({
        entityId: "codex:tool:abc123:ls",
        entityKind: "tool-run",
        displayName: "ls",
        eventId: "evt_t1",
        timestamp: "2026-04-09T20:15:40.000Z"
      })
    );
    const entities = new Map<string, typeof sessionEntity>([
      [sessionEntity.entityId, sessionEntity],
      [toolEntity.entityId, toolEntity]
    ]);
    const recentEvents: NormalizedEvent[] = [
      sampleEvent({ entityId: sessionEntity.entityId, eventId: "evt_s0", timestamp: "2026-04-09T20:15:30.000Z" }),
      sampleEvent({ entityId: toolEntity.entityId, eventId: "evt_t0", timestamp: "2026-04-09T20:15:35.000Z", entityKind: "tool-run", displayName: "ls" })
    ];

    const detail = getConversationDetail(
      { entityId: toolEntity.entityId, limit: 10 },
      { entities, recentEvents, now: new Date("2026-04-09T20:15:45.000Z") }
    );

    expect(detail).not.toBeNull();
    expect(detail?.members).toHaveLength(2);
    expect(detail?.current.entityId).toBe(toolEntity.entityId);
    expect(detail?.recentEvents.map((e) => e.eventId)).toEqual(["evt_t0", "evt_s0"]);
  });

  it("keeps the requested entity as current when anchoring a session lookup", () => {
    const sessionEntity = applyEvent(undefined, sampleEvent({ entityId: "codex:session:abc123", eventId: "evt_s1" }));
    const toolEntity = applyEvent(
      undefined,
      sampleEvent({
        entityId: "codex:tool:abc123:ls",
        entityKind: "tool-run",
        displayName: "ls",
        eventId: "evt_t1",
        timestamp: "2026-04-09T20:15:40.000Z"
      })
    );

    const entities = new Map<string, typeof sessionEntity>([
      [sessionEntity.entityId, sessionEntity],
      [toolEntity.entityId, toolEntity]
    ]);

    const detail = getConversationDetail(
      { source: "codex", sessionId: "abc123", entityId: toolEntity.entityId, limit: 10 },
      { entities, recentEvents: [], now: new Date("2026-04-09T20:15:45.000Z") }
    );

    expect(detail).not.toBeNull();
    expect(detail?.current.entityId).toBe(toolEntity.entityId);
    expect(detail?.representative.entityId).toBe(sessionEntity.entityId);
    expect(detail?.group.entityId).toBe(toolEntity.entityId);
  });

  it("normalizes whitespace source values for session lookups", () => {
    const sessionEntity = applyEvent(undefined, sampleEvent({ entityId: "codex:session:abc123", eventId: "evt_s1" }));
    const entities = new Map<string, typeof sessionEntity>([[sessionEntity.entityId, sessionEntity]]);

    const detail = getConversationDetail(
      { source: "  codex  ", sessionId: "abc123", limit: 10 },
      { entities, recentEvents: [], now: new Date("2026-04-09T20:15:45.000Z") }
    );

    expect(detail).not.toBeNull();
    expect(detail?.groupId).toBe("codex|abc123");
  });

  it("returns only the entity when entity has no sessionId", () => {
    const standalone = applyEvent(
      undefined,
      sampleEvent({
        entityId: "codex:agent:singleton",
        sessionId: undefined,
        entityKind: "subagent",
        eventId: "evt_a1"
      })
    );
    const entities = new Map([[standalone.entityId, standalone]]);
    const recentEvents: NormalizedEvent[] = [
      sampleEvent({ entityId: standalone.entityId, sessionId: undefined, eventId: "evt_a0" }),
      sampleEvent({ entityId: "codex:session:abc123", sessionId: "abc123", eventId: "evt_s0" })
    ];

    const detail = getConversationDetail(
      { entityId: standalone.entityId, limit: 10 },
      { entities, recentEvents, now: new Date("2026-04-09T20:15:45.000Z") }
    );

    expect(detail).not.toBeNull();
    expect(detail?.members).toHaveLength(1);
    expect(detail?.recentEvents.map((e) => e.eventId)).toEqual(["evt_a0"]);
  });

  it("clamps the exported helper limit to a safe range", () => {
    const sessionEntity = applyEvent(undefined, sampleEvent({ entityId: "codex:session:abc123", eventId: "evt_s1" }));
    const entities = new Map<string, typeof sessionEntity>([[sessionEntity.entityId, sessionEntity]]);
    const recentEvents: NormalizedEvent[] = [
      sampleEvent({ entityId: sessionEntity.entityId, eventId: "evt_old", timestamp: "2026-04-09T20:15:30.000Z" }),
      sampleEvent({ entityId: sessionEntity.entityId, eventId: "evt_new", timestamp: "2026-04-09T20:15:40.000Z" })
    ];

    const detail = getConversationDetail(
      { source: "codex", sessionId: "abc123", limit: 0 },
      { entities, recentEvents, now: new Date("2026-04-09T20:15:45.000Z") }
    );

    expect(detail).not.toBeNull();
    expect(detail?.recentEvents.map((event) => event.eventId)).toEqual(["evt_new"]);
  });
});

describe("conversation detail handler", () => {
  it("returns 404 when no group exists", async () => {
    const handler = createConversationDetailHandler({
      entities: new Map(),
      recentEvents: []
    });

    const req = { query: { source: "codex", sessionId: "missing" } } as any;
    const res = createMockRes();

    await handler(req as any, res as any, () => {});
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for missing source on session lookup", async () => {
    const handler = createConversationDetailHandler({
      entities: new Map(),
      recentEvents: []
    });

    const req = { query: { sessionId: "missing" } } as any;
    const res = createMockRes();

    await handler(req as any, res as any, () => {});
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when no lookup key is provided", async () => {
    const handler = createConversationDetailHandler({
      entities: new Map(),
      recentEvents: []
    });

    const req = { query: {} } as any;
    const res = createMockRes();

    await handler(req as any, res as any, () => {});
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an entity lookup with no match", async () => {
    const handler = createConversationDetailHandler({
      entities: new Map(),
      recentEvents: []
    });

    const req = { query: { entityId: "missing" } } as any;
    const res = createMockRes();

    await handler(req as any, res as any, () => {});
    expect(res.statusCode).toBe(404);
  });

  it("returns a clamped timeline and detail body for a successful lookup", async () => {
    const sessionEntity = applyEvent(undefined, sampleEvent({ entityId: "codex:session:abc123", eventId: "evt_s1" }));
    const entities = new Map<string, typeof sessionEntity>([[sessionEntity.entityId, sessionEntity]]);
    const handler = createConversationDetailHandler({
      entities,
      recentEvents: [
        sampleEvent({ entityId: sessionEntity.entityId, eventId: "evt_old", timestamp: "2026-04-09T20:15:30.000Z" }),
        sampleEvent({ entityId: sessionEntity.entityId, eventId: "evt_new", timestamp: "2026-04-09T20:15:40.000Z" })
      ]
    });

    const req = { query: { source: "codex", sessionId: "abc123", limit: "1" } } as any;
    const res = createMockRes();

    await handler(req as any, res as any, () => {});
    expect(res.statusCode).toBe(200);
    expect((res.body as any).groupId).toBe("codex|abc123");
    expect((res.body as any).recentEvents.map((event: NormalizedEvent) => event.eventId)).toEqual(["evt_new"]);
    expect((res.body as any).current.entityId).toBe("codex:session:abc123");
  });

  it("falls back to the default limit when the query limit is invalid", async () => {
    const sessionEntity = applyEvent(undefined, sampleEvent({ entityId: "codex:session:abc123", eventId: "evt_s1" }));
    const entities = new Map<string, typeof sessionEntity>([[sessionEntity.entityId, sessionEntity]]);
    const handler = createConversationDetailHandler({
      entities,
      recentEvents: [
        sampleEvent({ entityId: sessionEntity.entityId, eventId: "evt_old", timestamp: "2026-04-09T20:15:30.000Z" }),
        sampleEvent({ entityId: sessionEntity.entityId, eventId: "evt_new", timestamp: "2026-04-09T20:15:40.000Z" })
      ]
    });

    const req = { query: { source: "codex", sessionId: "abc123", limit: ["bad", "worse"] } } as any;
    const res = createMockRes();

    await handler(req as any, res as any, () => {});
    expect(res.statusCode).toBe(200);
    expect((res.body as any).recentEvents).toHaveLength(2);
  });
});
