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
    expect(detail?.events.map((e) => e.eventId)).toEqual(["evt_s0", "evt_t0"]);
    // Tool entity is newer, so it becomes the representative "current" snapshot by default.
    expect(detail?.current.entityId).toBe(toolEntity.entityId);
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
    expect(detail?.events.map((e) => e.eventId)).toEqual(["evt_s0", "evt_t0"]);
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
    expect(detail?.events.map((e) => e.eventId)).toEqual(["evt_a0"]);
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
});
