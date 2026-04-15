import { NormalizedEventSchema } from "@agent-watch/event-schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startTestHub } from "../test-helpers.js";

describe("entity session lifecycle", () => {
  const authToken = "test-secret";

  let hub: Awaited<ReturnType<typeof startTestHub>>;

  beforeEach(async () => {
    hub = await startTestHub(authToken);
  });

  afterEach(async () => {
    await hub.close();
  });

  async function postEvent(event: object): Promise<void> {
    const parsed = NormalizedEventSchema.parse(event);
    const res = await fetch(`${hub.baseUrl}/api/events/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ events: [parsed] }),
    });
    expect(res.status).toBe(200);
  }

  it("1. session_start → active: posts session_start event → entity created with status active", async () => {
    const entityId = `entity-lifecycle-1-${Date.now()}`;
    // Use a recent timestamp so the entity is still within the active window when we check
    const now = new Date();
    const eventTime = new Date(now.getTime() - 1_000); // 1 second ago

    await postEvent({
      eventId: `evt-start-${entityId}`,
      timestamp: eventTime.toISOString(),
      source: "test-source",
      sourceHost: "test-host",
      entityId,
      entityKind: "session",
      displayName: "Test Session",
      eventType: "session_start",
    });

    expect(hub.store.entityCount).toBe(1);
    const state = hub.store.getState(true, now);
    expect(state.entities).toHaveLength(1);
    expect(state.entities[0]).toMatchObject({
      entityId,
      currentStatus: "active",
    });
  });

  it("2. Multiple messages keep active: posts 3 message events → entity stays active", async () => {
    const entityId = `entity-lifecycle-2-${Date.now()}`;
    const baseTime = new Date();

    await postEvent({
      eventId: `evt-msg1-${entityId}`,
      timestamp: new Date(baseTime.getTime() - 5_000).toISOString(),
      source: "test-source",
      sourceHost: "test-host",
      entityId,
      entityKind: "session",
      displayName: "Test Session",
      eventType: "session_start",
    });

    await postEvent({
      eventId: `evt-msg2-${entityId}`,
      timestamp: new Date(baseTime.getTime() - 3_000).toISOString(),
      source: "test-source",
      sourceHost: "test-host",
      entityId,
      entityKind: "session",
      displayName: "Test Session",
      eventType: "message",
      status: "active",
    });

    await postEvent({
      eventId: `evt-msg3-${entityId}`,
      timestamp: new Date(baseTime.getTime() - 1_000).toISOString(),
      source: "test-source",
      sourceHost: "test-host",
      entityId,
      entityKind: "session",
      displayName: "Test Session",
      eventType: "message",
      status: "active",
    });

    expect(hub.store.entityCount).toBe(1);
    const state = hub.store.getState(true, baseTime);
    expect(state.entities).toHaveLength(1);
    expect(state.entities[0]).toMatchObject({
      entityId,
      currentStatus: "active",
    });
  });

  it("3. session_finished → done: posts session_finished → entity status done", async () => {
    const entityId = `entity-lifecycle-3-${Date.now()}`;

    await postEvent({
      eventId: `evt-finish-start-${entityId}`,
      timestamp: "2026-04-15T10:00:00.000Z",
      source: "test-source",
      sourceHost: "test-host",
      entityId,
      entityKind: "session",
      displayName: "Test Session",
      eventType: "session_start",
    });

    await postEvent({
      eventId: `evt-finish-end-${entityId}`,
      timestamp: "2026-04-15T10:05:00.000Z",
      source: "test-source",
      sourceHost: "test-host",
      entityId,
      entityKind: "session",
      displayName: "Test Session",
      eventType: "session_finished",
    });

    expect(hub.store.entityCount).toBe(1);
    const state = hub.store.getState(true, new Date());
    expect(state.entities).toHaveLength(1);
    expect(state.entities[0]).toMatchObject({
      entityId,
      currentStatus: "done",
    });
  });

  it("4. expire removes entity: after session_finished, expire() past retention window → entity removed", async () => {
    const entityId = `entity-lifecycle-4-${Date.now()}`;

    await postEvent({
      eventId: `evt-expire-${entityId}`,
      timestamp: "2026-04-09T18:00:00.000Z",
      source: "test-source",
      sourceHost: "test-host",
      entityId,
      entityKind: "session",
      displayName: "Test Session",
      eventType: "session_finished",
    });

    expect(hub.store.entityCount).toBe(1);

    hub.store.expire(new Date("2026-04-09T20:00:01.000Z"));

    expect(hub.store.entityCount).toBe(0);
    const state = hub.store.getState(true, new Date());
    expect(state.entities).toHaveLength(0);
  });
});
