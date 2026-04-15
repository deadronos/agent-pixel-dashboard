import { NormalizedEventSchema } from "@agent-watch/event-schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startTestHub } from "../test-helpers.js";

describe("deduplication integration", () => {
  const authToken = "test-token";

  let hub: Awaited<ReturnType<typeof startTestHub>>;

  beforeEach(async () => {
    hub = await startTestHub({ authToken });
  });

  afterEach(async () => {
    await hub.close();
  });

  async function postBatch(events: object[]): Promise<{ status: number; body: unknown }> {
    const parsed = events.map((e) => NormalizedEventSchema.parse(e));
    const res = await fetch(`${hub.baseUrl}/api/events/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ events: parsed }),
    });
    const body = await res.json();
    return { status: res.status, body };
  }

  it("1. Same eventId in single batch: only one accepted, one rejected", async () => {
    const entityId = `dedup-single-${Date.now()}-${Math.random()}`;
    const eventTime = new Date().toISOString();

    const { status, body } = await postBatch([
      {
        eventId: `evt-dedup-shared-${entityId}`,
        timestamp: eventTime,
        source: "test-source",
        sourceHost: "test-host",
        entityId,
        entityKind: "session",
        displayName: "Test Session",
        eventType: "session_start",
      },
      {
        eventId: `evt-dedup-shared-${entityId}`, // duplicate eventId
        timestamp: eventTime,
        source: "test-source",
        sourceHost: "test-host",
        entityId,
        entityKind: "session",
        displayName: "Test Session",
        eventType: "message",
        status: "active",
      },
    ]);

    expect(status).toBe(200);
    // First occurrence is accepted, second duplicate is rejected
    expect(body).toMatchObject({ accepted: 1, rejected: 1 });
  });

  it("2. Same eventId in later batch: rejected by RecentEventBuffer", async () => {
    const entityId = `dedup-later-${Date.now()}-${Math.random()}`;
    const eventTime = new Date().toISOString();

    // First batch: event accepted
    const first = await postBatch([
      {
        eventId: `evt-dedup-later-${entityId}`,
        timestamp: eventTime,
        source: "test-source",
        sourceHost: "test-host",
        entityId,
        entityKind: "session",
        displayName: "Test Session",
        eventType: "session_start",
      },
    ]);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ accepted: 1, rejected: 0 });

    // Second batch (later): same eventId should be rejected
    const second = await postBatch([
      {
        eventId: `evt-dedup-later-${entityId}`, // same eventId as first batch
        timestamp: eventTime,
        source: "test-source",
        sourceHost: "test-host",
        entityId,
        entityKind: "session",
        displayName: "Test Session",
        eventType: "message",
        status: "active",
      },
    ]);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ accepted: 0, rejected: 1 });
  });
});
