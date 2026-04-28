import { NormalizedEventSchema } from "@agent-watch/event-schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { startTestHub } from "../test-helpers.js";

describe("WebSocket lifecycle", () => {
  const authToken = "test-token";
  let close: () => Promise<void>;
  let baseUrl: string;
  let getWebSocketClients: () => Set<WebSocket>;

  beforeEach(async () => {
    const hub = await startTestHub({ authToken, heartbeatIntervalMs: 25 });
    close = hub.close;
    baseUrl = hub.baseUrl;
    getWebSocketClients = hub.getWebSocketClients;
  });

  afterEach(async () => {
    await close();
  });

  it("1. Hello on connect: WebSocket connects to /ws and receives hello message with entity count", async () => {
    let ws: WebSocket;
    ws = new WebSocket(`${baseUrl}/ws`);

    const helloPromise = new Promise<unknown>((resolve) => {
      ws.on("message", (data) => resolve(JSON.parse(data.toString())));
    });

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    const hello = await helloPromise;
    expect(hello).toMatchObject({ type: "hello", entities: 0 });

    ws.close();
  });

  it("2. Broadcast after event: After posting an event via HTTP, WebSocket receives a broadcast", async () => {
    let ws: WebSocket;
    ws = new WebSocket(`${baseUrl}/ws`);

    const messages: unknown[] = [];
    let helloResolve: () => void;
    const helloReceived = new Promise<void>((resolve) => {
      helloResolve = resolve;
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
      if (msg.type === "hello" && helloResolve) {
        helloResolve();
      }
    });

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    // Wait for hello to arrive
    await helloReceived;

    // Post an event
    const event = {
      eventId: "evt-001",
      timestamp: "2026-04-15T00:00:00.000Z",
      source: "test-source",
      sourceHost: "test-host",
      entityId: "entity-001",
      entityKind: "session",
      displayName: "Test Session",
      eventType: "session.start",
    };
    const parsed = NormalizedEventSchema.parse(event);

    const res = await fetch(`${baseUrl}/api/events/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ events: [parsed] }),
    });
    expect(res.status).toBe(200);

    // Wait for broadcast
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have at least hello + broadcast
    const broadcasts = messages.filter(
      (m) => typeof m === "object" && m !== null && (m as Record<string, unknown>).type === "events",
    );
    expect(broadcasts.length).toBeGreaterThanOrEqual(1);

    ws.close();
  });

  it("3. No throw on closed client: Posting an event while a client is closed does not throw", async () => {
    let ws: WebSocket;
    ws = new WebSocket(`${baseUrl}/ws`);

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    ws.close();

    await new Promise(resolve => setTimeout(resolve, 100));

    const event = {
      eventId: "evt-002",
      timestamp: "2026-04-15T00:00:00.000Z",
      source: "test-source",
      sourceHost: "test-host",
      entityId: "entity-002",
      entityKind: "session",
      displayName: "Test Session 2",
      eventType: "session.start",
    };
    const parsed = NormalizedEventSchema.parse(event);

    let threw = false;
    let res: Response | undefined;
    try {
      res = await fetch(`${baseUrl}/api/events/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ events: [parsed] }),
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    if (res) expect(res.status).toBe(200);
  });

  it("4. Reconnect shows current entity count: After disconnecting and reconnecting, hello shows correct entity count", async () => {
    // Connect first client
    const ws1 = new WebSocket(`${baseUrl}/ws`);

    let hello1Resolve: () => void;
    const hello1Received = new Promise<void>((resolve) => {
      hello1Resolve = resolve;
    });

    ws1.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "hello" && hello1Resolve) {
        hello1Resolve();
      }
    });

    await new Promise<void>((resolve, reject) => {
      ws1.on("open", resolve);
      ws1.on("error", reject);
    });

    // Wait for hello
    await hello1Received;

    // Post an event
    const event = {
      eventId: "evt-003",
      timestamp: "2026-04-15T00:00:00.000Z",
      source: "test-source",
      sourceHost: "test-host",
      entityId: "entity-003",
      entityKind: "session",
      displayName: "Test Session 3",
      eventType: "session.start",
    };
    const parsed = NormalizedEventSchema.parse(event);

    const res = await fetch(`${baseUrl}/api/events/batch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ events: [parsed] }),
    });
    expect(res.status).toBe(200);

    ws1.close();

    await new Promise(resolve => setTimeout(resolve, 100));

    // Reconnect and verify entity count in hello
    const ws2 = new WebSocket(`${baseUrl}/ws`);

    const hello2Promise = new Promise<unknown>((resolve) => {
      ws2.on("message", (data) => resolve(JSON.parse(data.toString())));
    });

    await new Promise<void>((resolve, reject) => {
      ws2.on("open", resolve);
      ws2.on("error", reject);
    });

    const hello = await hello2Promise;
    expect(hello).toMatchObject({ type: "hello", entities: 1 });

    ws2.close();
  });

  it("5. Heartbeat terminates clients that stop answering pings", async () => {
    const ws = new WebSocket(`${baseUrl}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });
    const [serverClient] = Array.from(getWebSocketClients()) as Array<WebSocket & { isAlive?: boolean }>;
    serverClient.isAlive = false;

    await new Promise((resolve) => setTimeout(resolve, 35));

    expect(getWebSocketClients().size).toBe(0);
  });
});
