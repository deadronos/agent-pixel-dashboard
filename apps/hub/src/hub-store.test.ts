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

    // Entity is dormant at 20:20 (10 min later), so filtered result is empty
    const result = store.getState(false, new Date("2026-04-09T20:20:00.000Z"));
    expect(result.entities).toEqual([]);
    expect(result.total).toBe(0); // filtered count (dormant excluded)
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(0);

    // With includeDormant=true, entity is included
    const allResult = store.getState(true, new Date("2026-04-09T20:20:00.000Z"));
    expect(allResult.entities).toHaveLength(1);
    expect(allResult.total).toBe(1);
    expect(allResult.offset).toBe(0);
    expect(allResult.limit).toBe(1);
  });

  it("supports pagination with limit and offset", () => {
    const store = new HubStore();
    store.ingestBatch({
      events: [
        sampleEvent({ entityId: "e1", eventId: "evt_1", timestamp: "2026-04-09T20:15:00.000Z" }),
        sampleEvent({ entityId: "e2", eventId: "evt_2", timestamp: "2026-04-09T20:16:00.000Z" }),
        sampleEvent({ entityId: "e3", eventId: "evt_3", timestamp: "2026-04-09T20:17:00.000Z" }),
      ]
    });

    const result = store.getState(true, new Date("2026-04-09T20:20:00.000Z"), 2, 0);
    expect(result.entities).toHaveLength(2);
    expect(result.total).toBe(3);
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(2);

    const page2 = store.getState(true, new Date("2026-04-09T20:20:00.000Z"), 2, 2);
    expect(page2.entities).toHaveLength(1);
    expect(page2.total).toBe(3);
    expect(page2.offset).toBe(2);
    expect(page2.limit).toBe(2);
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

  it("continues processing remaining events after a parse failure (partial batch)", () => {
    const store = new HubStore();
    const result = store.ingestBatch({
      collectorId: "collector-a",
      events: [
        sampleEvent({ eventId: "evt_1", entityId: "codex:session:s1" }),
        { bad: "event" }, // fails parse
        sampleEvent({ eventId: "evt_2", entityId: "codex:session:s2" }),
        { also: "bad" },  // fails parse
        sampleEvent({ eventId: "evt_3", entityId: "codex:session:s3" }),
      ],
    });

    expect(result.accepted.map((e) => e.eventId)).toEqual(["evt_1", "evt_2", "evt_3"]);
    expect(result.rejected).toBe(2);
    expect(store.entityCount).toBe(3);
  });
});
