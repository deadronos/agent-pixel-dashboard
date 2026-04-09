import { describe, expect, it } from "vitest";
import type { NormalizedEvent } from "@agent-watch/event-schema";
import { buildSizedBatches } from "./batching.js";

function mkEvent(id: number, detailSize = 200): NormalizedEvent {
  return {
    eventId: `evt_${id}`,
    timestamp: "2026-04-09T20:15:31.000Z",
    source: "codex",
    sourceHost: "workstation",
    entityId: `codex:session:${id}`,
    sessionId: `${id}`,
    parentEntityId: null,
    entityKind: "session",
    displayName: "Codex",
    eventType: "message",
    status: "active",
    summary: "test",
    detail: "x".repeat(detailSize),
    activityScore: 0.5,
    sequence: id,
    meta: {}
  };
}

describe("buildSizedBatches", () => {
  it("splits into multiple batches under byte budget", () => {
    const events = Array.from({ length: 10 }, (_v, i) => mkEvent(i + 1, 400));
    const batches = buildSizedBatches(events, {
      collectorId: "collector-a",
      maxBytes: 2200
    });
    expect(batches.length).toBeGreaterThan(1);
    for (const body of batches) {
      expect(Buffer.byteLength(body, "utf8")).toBeLessThanOrEqual(2200);
    }
  });

  it("forces a single-event batch when one event is larger than budget", () => {
    const events = [mkEvent(1, 5000)];
    const batches = buildSizedBatches(events, {
      collectorId: "collector-a",
      maxBytes: 1200
    });
    expect(batches).toHaveLength(1);
    const parsed = JSON.parse(batches[0]) as { events: Array<{ eventId: string }> };
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].eventId).toBe("evt_1");
  });
});
