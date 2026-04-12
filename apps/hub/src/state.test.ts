import type { NormalizedEvent } from "@agent-watch/event-schema";
import { describe, expect, it } from "vitest";

import { applyEvent, computeStatus, type EntityState } from "./state.js";

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

describe("state projection", () => {
  it("applies event into state", () => {
    const state = applyEvent(undefined, sampleEvent({ meta: { groupKey: "workspace-a" } }));
    expect(state.entityId).toBe("codex:session:abc123");
    expect(state.currentStatus).toBe("active");
    expect(state.recentEvents.length).toBe(1);
    expect(state.groupKey).toBe("workspace-a");
  });

  it("decays status over inactivity windows", () => {
    const base: EntityState = applyEvent(undefined, sampleEvent());
    expect(computeStatus(base, new Date("2026-04-09T20:15:36.000Z"))).toBe("active");
    expect(computeStatus(base, new Date("2026-04-09T20:15:50.000Z"))).toBe("idle");
    expect(computeStatus(base, new Date("2026-04-09T20:16:45.000Z"))).toBe("sleepy");
    expect(computeStatus(base, new Date("2026-04-09T20:18:00.000Z"))).toBe("dormant");
  });
});
