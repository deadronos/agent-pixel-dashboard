import type { NormalizedEvent } from "@agent-watch/event-schema";
import { describe, expect, it } from "vitest";

import { createRecentEventsHandler } from "./recent-events-handler.js";
import { HubStore } from "./hub-store.js";

interface RecentEventsBody {
  events: NormalizedEvent[];
}

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
    body: RecentEventsBody | undefined;
    status: (code: number) => typeof res;
    json: (body: unknown) => void;
  } = {
    statusCode: 200,
    body: undefined,
    status(_code: number) {
      this.statusCode = _code;
      return this;
    },
    json(_body: unknown) {
      this.body = _body as RecentEventsBody;
    }
  };
  return res;
}

function ingestEvents(store: HubStore, events: NormalizedEvent[]) {
  store.ingestBatch({ collectorId: "test", events });
}

describe("createRecentEventsHandler", () => {
  it("returns 401 when authorization header is missing", () => {
    const store = new HubStore();
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "" } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when bearer token is wrong", () => {
    const store = new HubStore();
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "Bearer wrong" } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(401);
  });

  it("returns events array with correct token", () => {
    const store = new HubStore();
    ingestEvents(store, [sampleEvent()]);
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "Bearer secret", query: {} } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("events");
    expect(Array.isArray(res.body?.events)).toBe(true);
  });

  it("clamps limit=0 to minimum of 1", () => {
    const store = new HubStore();
    for (let i = 0; i < 5; i++) ingestEvents(store, [sampleEvent({ eventId: `evt_${i}` })]);
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "Bearer secret", query: { limit: "0" } } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(200);
    // With limit clamped to 1, slice(-1) returns only the last event
    expect(res.body?.events.length).toBe(1);
  });

  it("clamps limit=9999 to maximum of 500", () => {
    const store = new HubStore();
    for (let i = 0; i < 600; i++) ingestEvents(store, [sampleEvent({ eventId: `evt_${i}` })]);
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "Bearer secret", query: { limit: "9999" } } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(200);
    expect(res.body?.events.length).toBe(500);
  });

  it("defaults to 100 when no limit is provided", () => {
    const store = new HubStore();
    for (let i = 0; i < 150; i++) ingestEvents(store, [sampleEvent({ eventId: `evt_${i}` })]);
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "Bearer secret", query: {} } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(200);
    expect(res.body?.events.length).toBe(100);
  });

  it("returns empty events array when store is empty", () => {
    const store = new HubStore();
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "Bearer secret", query: {} } as any;
    const res = createMockRes();

    handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(200);
    expect(res.body?.events).toEqual([]);
  });
});
