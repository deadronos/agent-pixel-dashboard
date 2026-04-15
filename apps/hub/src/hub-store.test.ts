import type { NormalizedEvent } from "@agent-watch/event-schema";
import { describe, expect, it } from "vitest";

import { HubStore } from "./hub-store.js";

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

describe("HubStore", () => {
  it("dedupes events and rejects invalid rows without aborting the batch", () => {
    const store = new HubStore();
    const result = store.ingestBatch({
      collectorId: "collector-a",
      events: [
        sampleEvent(),
        sampleEvent(),
        { ...sampleEvent({ eventId: "evt_bad" }), activityScore: 2 }
      ]
    });

    expect(result.accepted.map((event) => event.eventId)).toEqual(["evt_1"]);
    expect(result.rejected).toBe(2); // 1 duplicate + 1 invalid row
    expect(store.entityCount).toBe(1);
    expect(store.recentEventCount).toBe(1);
  });

  it("filters dormant entities from the default state response", () => {
    const store = new HubStore();
    store.ingestBatch({
      events: [sampleEvent({ timestamp: "2026-04-09T20:10:00.000Z" })]
    });

    expect(store.getState(false, new Date("2026-04-09T20:20:00.000Z")).entities).toEqual([]);
    expect(store.getState(true, new Date("2026-04-09T20:20:00.000Z")).entities).toHaveLength(1);
  });

  it("expires done entities after the retention window", () => {
    const store = new HubStore();
    store.ingestBatch({
      events: [
        sampleEvent({
          eventId: "evt_done",
          eventType: "session_finished",
          timestamp: "2026-04-09T18:00:00.000Z"
        })
      ]
    });

    store.expire(new Date("2026-04-09T20:00:01.000Z"));
    expect(store.entityCount).toBe(0);
  });
});
