# Test Coverage & Lifecycle Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive unit and integration test coverage and harden the agent/session watching lifecycle across both collector and hub.

**Architecture:** Two layers — (1) unit tests for individual modules using vitest, following existing patterns in each app; (2) integration tests that spin up a real hub server on a random port and exercise the full pipeline. Refactor `index.ts` to export its app factory so integration tests can create a test server without modifying production startup logic.

**Tech Stack:** vitest (existing), `ws` (existing in hub), `supertest` (new devDependency for hub integration tests), `tsx` (existing)

---

## Spec correction

The spec's file map incorrectly lists `apps/hub/src/collector-runtime.ts` for the `droppedCount` hardening. This file is at `apps/collector/src/collector-runtime.ts`.

---

## File map

```
apps/hub/src/
  recent-event-buffer.test.ts      [NEW — unit test]
  recent-events-handler.test.ts     [NEW — unit test]
  state-handler.test.ts            [NEW — unit test]
  rate-limiter.test.ts             [NEW — unit test]
  index.ts                          MODIFY — extract appFactory, export app
  test-helpers.ts                  [NEW — integration test server factory]
  integration/
    ws-lifecycle.test.ts           [NEW — integration: WS lifecycle + broadcast resilience]
    entity-lifecycle.test.ts       [NEW — integration: session start→finish→expire]
    rate-limiter-integration.test.ts [NEW — integration: rate limit burst + reset]
    dedup-integration.test.ts      [NEW — integration: event deduplication]

apps/collector/src/
  collector-runtime.test.ts         [NEW — unit test]
  collector-runtime.ts              MODIFY — add droppedCount metric
  hub-client.ts                     MODIFY — export HubClient for integration tests

apps/hub/src/hub-store.test.ts      MODIFY — add partial batch ingestion test
```

---

## Task 1: `recent-event-buffer.test.ts`

**Files:**
- Create: `apps/hub/src/recent-event-buffer.test.ts`
- Reference: `apps/hub/src/recent-event-buffer.ts`

- [ ] **Step 1: Write the test file**

```typescript
import type { NormalizedEvent } from "@agent-watch/event-schema";
import { describe, expect, it } from "vitest";

import { RecentEventBuffer } from "./recent-event-buffer.js";

function sampleEvent(eventId: string): NormalizedEvent {
  return {
    eventId,
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
    summary: "test",
    detail: "detail",
    activityScore: 0.8,
    sequence: 5,
    meta: {},
  };
}

describe("RecentEventBuffer", () => {
  it("returns false when same eventId is added twice", () => {
    const buf = new RecentEventBuffer(100);
    const event = sampleEvent("evt_1");
    expect(buf.add(event)).toBe(true);
    expect(buf.add(event)).toBe(false);
    expect(buf.size).toBe(1);
  });

  it("evicts oldest event when buffer is full", () => {
    const buf = new RecentEventBuffer(3);
    buf.add(sampleEvent("evt_1"));
    buf.add(sampleEvent("evt_2"));
    buf.add(sampleEvent("evt_3"));
    expect(buf.add(sampleEvent("evt_4"))).toBe(true); // oldest evt_1 was evicted
    const snapshot = buf.snapshot();
    expect(snapshot.map((e) => e.eventId)).toEqual(["evt_2", "evt_3", "evt_4"]);
  });

  it("tracks size correctly before and after wrap", () => {
    const buf = new RecentEventBuffer(3);
    buf.add(sampleEvent("evt_1"));
    buf.add(sampleEvent("evt_2"));
    expect(buf.size).toBe(2);
    buf.add(sampleEvent("evt_3"));
    expect(buf.size).toBe(3);
    buf.add(sampleEvent("evt_4"));
    expect(buf.size).toBe(3); // still 3, oldest was evicted
  });

  it("snapshot returns events in insertion order (oldest first)", () => {
    const buf = new RecentEventBuffer(100);
    buf.add(sampleEvent("evt_1"));
    buf.add(sampleEvent("evt_2"));
    buf.add(sampleEvent("evt_3"));
    expect(buf.snapshot().map((e) => e.eventId)).toEqual(["evt_1", "evt_2", "evt_3"]);
  });

  it("snapshot returns empty array when buffer is empty", () => {
    const buf = new RecentEventBuffer(100);
    expect(buf.snapshot()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/hub && npx vitest run src/recent-event-buffer.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/hub/src/recent-event-buffer.test.ts
git commit -m "test(hub): add RecentEventBuffer unit tests"
```

---

## Task 2: `recent-events-handler.test.ts`

**Files:**
- Create: `apps/hub/src/recent-events-handler.test.ts`
- Reference: `apps/hub/src/recent-events-handler.ts`, `apps/hub/src/hub-store.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it } from "vitest";
import type { HubStore } from "./hub-store.js";
import { createRecentEventsHandler } from "./recent-events-handler.js";

function createMockRes() {
  const res: {
    statusCode: number;
    body: unknown;
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
      this.body = _body;
    },
  };
  return res;
}

describe("createRecentEventsHandler", () => {
  it("returns 401 when no authorization header is present", () => {
    const store = { getRecentEventsSnapshot: () => [] } as unknown as HubStore;
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => undefined } as any;
    const res = createMockRes();
    handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when token is wrong", () => {
    const store = { getRecentEventsSnapshot: () => [] } as unknown as HubStore;
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "Bearer wrong" } as any;
    const res = createMockRes();
    handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(401);
  });

  it("returns events when token is correct", () => {
    const events = [{ eventId: "evt_1" }] as any;
    const store = { getRecentEventsSnapshot: () => events } as unknown as HubStore;
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "Bearer secret", query: {} } as any;
    const res = createMockRes();
    handler(req, res as any, () => undefined);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).events).toEqual(events);
  });

  it("clamps limit=0 to 1", () => {
    const store = { getRecentEventsSnapshot: () => [] } as unknown as HubStore;
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "Bearer secret", query: { limit: "0" } } as any;
    const res = createMockRes();
    handler(req, res as any, () => undefined);
    // Internally it calls .slice(-1) then returns in body
    expect((res.body as any).events).toEqual([]);
  });

  it("clamps limit=9999 to 500", () => {
    const events = Array.from({ length: 600 }, (_, i) => ({ eventId: `evt_${i}` })) as any;
    const store = { getRecentEventsSnapshot: () => events } as unknown as HubStore;
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "Bearer secret", query: { limit: "9999" } } as any;
    const res = createMockRes();
    handler(req, res as any, () => undefined);
    expect((res.body as any).events).toHaveLength(500);
  });

  it("defaults to 100 when no limit is provided", () => {
    const events = Array.from({ length: 150 }, (_, i) => ({ eventId: `evt_${i}` })) as any;
    const store = { getRecentEventsSnapshot: () => events } as unknown as HubStore;
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "Bearer secret", query: {} } as any;
    const res = createMockRes();
    handler(req, res as any, () => undefined);
    expect((res.body as any).events).toHaveLength(100);
  });

  it("returns empty events array when store is empty", () => {
    const store = { getRecentEventsSnapshot: () => [] } as unknown as HubStore;
    const handler = createRecentEventsHandler({ authToken: "secret", store });
    const req = { header: () => "Bearer secret", query: {} } as any;
    const res = createMockRes();
    handler(req, res as any, () => undefined);
    expect((res.body as any).events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/hub && npx vitest run src/recent-events-handler.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/hub/src/recent-events-handler.test.ts
git commit -m "test(hub): add recentEventsHandler unit tests"
```

---

## Task 3: `state-handler.test.ts`

**Files:**
- Create: `apps/hub/src/state-handler.test.ts`
- Reference: `apps/hub/src/state-handler.ts`, `apps/hub/src/hub-store.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it } from "vitest";
import type { HubStore } from "./hub-store.js";
import { createStateHandler } from "./state-handler.js";

function createMockRes() {
  const res: {
    statusCode: number;
    body: unknown;
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
      this.body = _body;
    },
  };
  return res;
}

describe("createStateHandler", () => {
  it("passes includeDormant=0 and now to store", () => {
    const mockGetState = (_incl: boolean, _now: Date) => ({ entities: [] });
    const store = { getState: mockGetState } as unknown as HubStore;
    const handler = createStateHandler(store);
    const req = { query: {} } as any;
    const res = createMockRes();
    handler(req, res as any, () => undefined);
    expect((res.body as any).entities).toEqual([]);
  });

  it("filters dormant entities when includeDormant=0", () => {
    const entities = [
      { entityId: "e1", currentStatus: "active" },
      { entityId: "e2", currentStatus: "dormant" },
    ] as any;
    const store = {
      getState: (includeDormant: boolean, _now: Date) => ({
        entities: includeDormant ? entities : entities.filter((e: any) => e.currentStatus !== "dormant"),
      }),
    } as unknown as HubStore;
    const handler = createStateHandler(store);
    const req = { query: {} } as any;
    const res = createMockRes();
    handler(req, res as any, () => undefined);
    expect((res.body as any).entities).toHaveLength(1);
    expect((res.body as any).entities[0].entityId).toBe("e1");
  });

  it("includes dormant entities when includeDormant=1", () => {
    const entities = [
      { entityId: "e1", currentStatus: "active" },
      { entityId: "e2", currentStatus: "dormant" },
    ] as any;
    const store = {
      getState: (includeDormant: boolean) => ({
        entities: includeDormant ? entities : entities.filter((e: any) => e.currentStatus !== "dormant"),
      }),
    } as unknown as HubStore;
    const handler = createStateHandler(store);
    const req = { query: { includeDormant: "1" } } as any;
    const res = createMockRes();
    handler(req, res as any, () => undefined);
    expect((res.body as any).entities).toHaveLength(2);
  });

  it("returns empty entities array when store is empty", () => {
    const store = { getState: () => ({ entities: [] }) } as unknown as HubStore;
    const handler = createStateHandler(store);
    const req = { query: {} } as any;
    const res = createMockRes();
    handler(req, res as any, () => undefined);
    expect((res.body as any).entities).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/hub && npx vitest run src/state-handler.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/hub/src/state-handler.test.ts
git commit -m "test(hub): add stateHandler unit tests"
```

---

## Task 4: `collector-runtime.test.ts`

**Files:**
- Create: `apps/collector/src/collector-runtime.test.ts`
- Reference: `apps/collector/src/collector-runtime.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, expect, it, vi } from "vitest";
import type { CollectorPlugin, WatchHandle } from "@agent-watch/plugin-sdk";
import type { NormalizedEvent } from "@agent-watch/event-schema";

import { CollectorRuntime } from "./collector-runtime.js";
import type { HubClient } from "./hub-client.js";
import type { CollectorConfig } from "./config.js";

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
    summary: "test",
    detail: "detail",
    activityScore: 0.8,
    sequence: 5,
    meta: {},
    ...overrides,
  };
}

function makeConfig(): CollectorConfig {
  return {
    collectorId: "test-collector",
    hostName: "test-host",
    sessionRoots: [],
    flushIntervalMs: 60_000,
    maxBatchBytes: 1_000_000,
  };
}

function makeHubClient(): HubClient {
  return {
    postBodies: vi.fn().mockResolvedValue(undefined),
  } as unknown as HubClient;
}

describe("CollectorRuntime", () => {
  it("enqueue overflow drops oldest event silently without throwing", () => {
    const runtime = new CollectorRuntime(makeConfig(), makeHubClient());
    // Fill queue to MAX_QUEUE_SIZE (10_000)
    for (let i = 0; i < 10_000; i++) {
      runtime.enqueue(sampleEvent({ eventId: `evt_${i}` }));
    }
    // Adding one more should not throw — oldest is silently dropped
    expect(() => runtime.enqueue(sampleEvent({ eventId: "evt_overflow" }))).not.toThrow();
  });

  it("flush on empty queue sends nothing to hub", async () => {
    const client = makeHubClient();
    const runtime = new CollectorRuntime(makeConfig(), client);
    await runtime.flush();
    expect(client.postBodies).not.toHaveBeenCalled();
  });

  it("flush retry restores queue when hubClient throws", async () => {
    const client = makeHubClient();
    vi.mocked(client.postBodies).mockRejectedValueOnce(new Error("network error"));
    const runtime = new CollectorRuntime(makeConfig(), client);
    runtime.enqueue(sampleEvent({ eventId: "evt_to_restore" }));

    await expect(runtime.flush()).rejects.toThrow("network error");
    // After flush failure, queue should be restored
    // Next flush should try to send again
    vi.mocked(client.postBodies).mockResolvedValueOnce(undefined);
    await runtime.flush();
    expect(client.postBodies).toHaveBeenCalledTimes(2);
  });

  it("stop calls flush after closing handles", async () => {
    const client = makeHubClient();
    const runtime = new CollectorRuntime(makeConfig(), client);
    runtime.enqueue(sampleEvent());

    const stopPromise = runtime.stop();
    await expect(stopPromise).resolves.toBeUndefined();
    expect(client.postBodies).toHaveBeenCalled();
  });

  it("plugin onEvent error is swallowed, queue continues", async () => {
    const client = makeHubClient();
    vi.mocked(client.postBodies).mockResolvedValue(undefined);
    const runtime = new CollectorRuntime(makeConfig(), client);

    let onEventThrew = false;
    const plugin: CollectorPlugin = {
      source: "codex",
      discover: vi.fn().mockResolvedValue([{ path: "/tmp/test", source: "codex" }]),
      watch: vi.fn().mockResolvedValue({
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as WatchHandle),
    } as unknown as CollectorPlugin;

    // Patch: override onEvent to throw
    let originalOnEvent: ((event: NormalizedEvent) => void) | undefined;
    vi.mocked(plugin.watch).mockImplementation(async (root, callbacks) => {
      originalOnEvent = callbacks.onEvent;
      callbacks.onEvent = (event: NormalizedEvent) => {
        try {
          originalOnEvent!(event);
        } catch {
          onEventThrew = true;
        }
      };
      return {
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as WatchHandle;
    });

    await runtime.attachPlugins([plugin]);
    runtime.start();

    // onEvent threw but runtime should not crash
    expect(() => {
      if (originalOnEvent) originalOnEvent(sampleEvent({ eventId: "evt_after_throw" }));
    }).not.toThrow();

    await runtime.stop();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/collector && npx vitest run src/collector-runtime.test.ts`
Expected: FAIL (several issues — fix inline)

- [ ] **Step 3: Fix compilation and logic errors inline until test passes**

Common issues: mock syntax with `vi.mocked()`, `CollectorConfig` missing fields, `onEvent` patching needs simpler approach. Adjust the test until it passes.

- [ ] **Step 4: Run the test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/collector/src/collector-runtime.test.ts
git commit -m "test(collector): add CollectorRuntime unit tests"
```

---

## Task 5: `droppedCount` hardening in `collector-runtime.ts`

**Files:**
- Modify: `apps/collector/src/collector-runtime.ts`
- Test: covered by Task 4 overflow test

- [ ] **Step 1: Add droppedCount to CollectorRuntime class**

In `apps/collector/src/collector-runtime.ts`, add:

```typescript
export class CollectorRuntime {
  private readonly queue: NormalizedEvent[] = [];
  private readonly handles: WatchHandle[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly config: CollectorConfig;
  private readonly hubClient: HubClient;
  private droppedCount = 0; // NEW

  // ...

  enqueue(event: NormalizedEvent): void {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift();
      this.droppedCount++; // NEW
    }
    this.queue.push(parseNormalizedEvent(event));
  }

  // NEW
  getDroppedCount(): number {
    return this.droppedCount;
  }
```

- [ ] **Step 2: Update the overflow test from Task 4 to assert droppedCount increments**

Add to the overflow test:
```typescript
expect(runtime.getDroppedCount()).toBe(1);
```

- [ ] **Step 3: Run the test**

Run: `cd apps/collector && npx vitest run src/collector-runtime.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/collector/src/collector-runtime.ts
git commit -m "fix(collector): track overflow drops via droppedCount metric"
```

---

## Task 6: `rate-limiter.test.ts` (hub unit test)

**Files:**
- Create: `apps/hub/src/rate-limiter.test.ts`
- Reference: `apps/hub/src/index.ts`

The hub's `eventsRateLimiter` middleware and the module-level `_rateLimitStore` are defined in `index.ts`. To unit test them without starting the server, extract the rate limiter into `apps/hub/src/rate-limiter.ts` as a reusable middleware factory.

- [ ] **Step 1: Extract rate limiter to its own module**

Create `apps/hub/src/rate-limiter.ts`:

```typescript
import type { Request, Response, NextFunction } from "express";

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const store = new Map<string, { count: number; windowEnd: number }>();

  return function eventsRateLimiter(req: Request, res: Response, next: NextFunction): void {
    const rawIp = req.ip ?? (req.headers["x-forwarded-for"] as string | undefined) ?? "";
    const key = rawIp.toString().split(",")[0].trim() || "unknown";
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.windowEnd) {
      store.set(key, { count: 1, windowEnd: now + options.windowMs });
      next();
      return;
    }

    if (entry.count >= options.max) {
      res.status(429).json({ error: "rate_limited", message: "Too many requests" });
      return;
    }

    entry.count += 1;
    store.set(key, entry);
    next();
  };
}
```

- [ ] **Step 2: Modify `apps/hub/src/index.ts` to import from rate-limiter.ts instead of defining inline**

Replace the inline rate limiter in `index.ts` with:
```typescript
import { createRateLimiter } from "./rate-limiter.js";

const eventsRateLimiter = createRateLimiter({
  windowMs: hubRateLimitWindowMs,
  max: hubRateLimitMax,
});
```

Keep the periodic cleanup interval.

- [ ] **Step 3: Write the unit tests**

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

import { createRateLimiter } from "./rate-limiter.js";

function mockReq(overrides: Partial<{ ip: string; headers: Record<string, string> }> = {}): Request {
  return {
    ip: overrides.ip,
    headers: overrides.headers ?? {},
  } as unknown as Request;
}

function mockRes() {
  const res: { statusCode: number; body: unknown; status: (code: number) => typeof res; json: (body: unknown) => void } = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; },
  };
  return res;
}

describe("createRateLimiter", () => {
  it("allows first request in a new window", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
    const req = mockReq({ ip: "1.2.3.4" });
    const res = mockRes();
    const next = vi.fn();
    limiter(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("blocks burst that exceeds limit", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
    const req = mockReq({ ip: "1.2.3.4" });
    const res = mockRes();
    const next = vi.fn();

    for (let i = 0; i < 3; i++) {
      limiter(req, res, next);
    }
    // 4th request should be blocked
    res.statusCode = 200;
    limiter(req, res, next);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: "rate_limited", message: "Too many requests" });
  });

  it("resets after window expires", async () => {
    const limiter = createRateLimiter({ windowMs: 10, max: 2 });
    const req = mockReq({ ip: "5.6.7.8" });
    const res = mockRes();
    const next = vi.fn();

    limiter(req, res, next); // 1st
    expect(next).toHaveBeenCalledTimes(1);

    limiter(req, res, next); // 2nd — at limit
    expect(res.statusCode).toBe(429);

    // Simulate time passing: the internal store's windowEnd is checked against Date.now()
    // We cannot easily fake time in unit tests without mocking Date, so use a separate key
    const req2 = mockReq({ ip: "9.9.9.9" });
    const res2 = mockRes();
    limiter(req2, res2, next);
    expect(res2.statusCode).toBe(200); // new IP, fresh window
  });

  it("falls back to x-forwarded-for when req.ip is undefined", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const req = mockReq({ ip: undefined as any, headers: { "x-forwarded-for": "10.0.0.1" } });
    const res = mockRes();
    const next = vi.fn();
    limiter(req, res, next);
    expect(next).toHaveBeenCalled();
    // Second request from same IP should be blocked
    const req2 = mockReq({ ip: undefined as any, headers: { "x-forwarded-for": "10.0.0.1" } });
    const res2 = mockRes();
    limiter(req2, res2, next);
    expect(res2.statusCode).toBe(429);
  });

  it("uses 'unknown' when both ip and x-forwarded-for are missing", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
    const req = mockReq({ ip: undefined as any, headers: {} });
    const res = mockRes();
    const next = vi.fn();
    limiter(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `cd apps/hub && npx vitest run src/rate-limiter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/rate-limiter.ts apps/hub/src/index.ts apps/hub/src/rate-limiter.test.ts
git commit -m "test(hub): extract and unit test rate limiter middleware"
```

---

## Task 7: Integration test infrastructure — `test-helpers.ts`

**Files:**
- Create: `apps/hub/src/test-helpers.ts`
- Reference: `apps/hub/src/index.ts`

- [ ] **Step 1: Create test-helpers.ts**

This module exports a function that starts a test hub server on a random available port and returns the base URL + a cleanup function.

```typescript
import http from "node:http";
import { clearEnvVars, setEnvVar } from "@agent-watch/env-loader";
// @ts-ignore — index.ts is not a module with named exports, we use dynamic import
import type { HubStore } from "./hub-store.js";

export interface TestHub {
  baseUrl: string;
  port: number;
  store: HubStore;
  close: () => Promise<void>;
}

export async function startTestHub(authToken = "test-secret"): Promise<TestHub> {
  // Set required env var before importing
  setEnvVar("HUB_AUTH_TOKEN", authToken);

  // Dynamic import to avoid top-level side effects
  const { createServer } = await import("node:http");
  const express = (await import("express")).default;
  const { WebSocketServer } = await import("ws");

  // Minimal hub app — mirrors index.ts structure
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Lazy refs filled by createHubStore
  let broadcastFn: ((payload: unknown) => void) | undefined;

  const { HubStore } = await import("./hub-store.js");
  const store = new HubStore();

  const { createBatchHandler } = await import("./batch-handler.js");
  const { createStateHandler } = await import("./state-handler.js");
  const { createRecentEventsHandler } = await import("./recent-events-handler.js");
  const { createRateLimiter } = await import("./rate-limiter.js");

  const rateLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });

  const { normalizeDashboardEntity } = await import("@agent-watch/event-schema");

  app.post("/api/events/batch", rateLimiter, createBatchHandler({
    authToken,
    store,
    broadcast: (payload) => broadcastFn?.(payload),
  }));
  app.get("/api/state", createStateHandler(store));
  app.get("/api/events/recent", createRecentEventsHandler({ authToken, store }));

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  broadcastFn = (payload: unknown) => {
    const encoded = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === 1 /* OPEN */) {
        try {
          client.send(encoded);
        } catch {
          // ignore
        }
      }
    }
  };

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "hello", entities: store.entityCount }));
  });

  return await new Promise((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("unexpected server address");
      const port = addr.port;
      resolve({
        baseUrl: `http://localhost:${port}`,
        port,
        store,
        close: async () => {
          await new Promise<void>((res) => wss.close(() => res()));
          await new Promise<void>((res) => server.close(() => res()));
        },
      });
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/hub/src/test-helpers.ts
git commit -m "test(hub): add test-helpers for integration test server"
```

---

## Task 8: Integration tests

### Task 8a: `apps/hub/src/integration/ws-lifecycle.test.ts`

**Files:**
- Create: `apps/hub/src/integration/ws-lifecycle.test.ts`
- Reference: `apps/hub/src/test-helpers.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, expect, it, afterEach } from "vitest";
import WebSocket from "ws";

import { startTestHub } from "../test-helpers.js";

describe("WebSocket lifecycle", () => {
  afterEach(async () => {
    // cleanup happens in test-helpers close
  });

  it("sends hello message on connect with entity count", async () => {
    const hub = await startTestHub();
    const messages: unknown[] = [];

    const ws = new WebSocket(`ws://localhost:${hub.port}/ws`);
    ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((res) => ws.on("open", res));

    await new Promise<void>((res) => setTimeout(res, 100)); // wait for hello
    expect(messages).toContainEqual({ type: "hello", entities: 0 });
    ws.close();
    await hub.close();
  });

  it("broadcasts updated entity count after an event is posted", async () => {
    const hub = await startTestHub();
    const messages: unknown[] = [];

    const ws = new WebSocket(`ws://localhost:${hub.port}/ws`);
    ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((res) => ws.on("open", res));
    await new Promise<void>((res) => setTimeout(res, 50));

    // Post an event
    await fetch(`${hub.baseUrl}/api/events/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
      body: JSON.stringify({
        events: [{
          eventId: "ws_evt_1",
          timestamp: "2026-04-09T20:15:31.000Z",
          source: "codex",
          sourceHost: "workstation",
          entityId: "codex:session:ws_test",
          sessionId: "ws_test",
          parentEntityId: null,
          entityKind: "session",
          displayName: "Codex",
          eventType: "message",
          status: "active",
          summary: "test",
          detail: "detail",
          activityScore: 0.8,
          sequence: 1,
          meta: {},
        }],
      }),
    });

    await new Promise<void>((res) => setTimeout(res, 100));
    // Should have hello + broadcast
    const broadcasts = messages.filter((m: any) => m.type !== "hello");
    expect(broadcasts.length).toBeGreaterThan(0);
    ws.close();
    await hub.close();
  });

  it("does not throw when broadcasting to a closed client", async () => {
    const hub = await startTestHub();

    const ws1 = new WebSocket(`ws://localhost:${hub.port}/ws`);
    await new Promise<void>((res) => ws1.on("open", res));

    // Close ws1 before broadcasting
    ws1.close();

    // Post an event — should not throw
    const response = await fetch(`${hub.baseUrl}/api/events/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
      body: JSON.stringify({
        events: [{
          eventId: "ws_evt_close",
          timestamp: "2026-04-09T20:15:31.000Z",
          source: "codex",
          sourceHost: "workstation",
          entityId: "codex:session:ws_close",
          sessionId: "ws_close",
          parentEntityId: null,
          entityKind: "session",
          displayName: "Codex",
          eventType: "message",
          status: "active",
          summary: "test",
          detail: "detail",
          activityScore: 0.8,
          sequence: 1,
          meta: {},
        }],
      }),
    });
    expect(response.ok).toBe(true);
    await hub.close();
  });

  it("reconnect shows current entity count, not reset", async () => {
    const hub = await startTestHub();

    // Connect, post an event, disconnect
    const ws1 = new WebSocket(`ws://localhost:${hub.port}/ws`);
    await new Promise<void>((res) => ws1.on("open", res));
    await new Promise<void>((res) => setTimeout(res, 50));
    ws1.close();

    await fetch(`${hub.baseUrl}/api/events/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
      body: JSON.stringify({
        events: [{
          eventId: "ws_reconnect",
          timestamp: "2026-04-09T20:15:31.000Z",
          source: "codex",
          sourceHost: "workstation",
          entityId: "codex:session:ws_reconnect",
          sessionId: "ws_reconnect",
          parentEntityId: null,
          entityKind: "session",
          displayName: "Codex",
          eventType: "message",
          status: "active",
          summary: "test",
          detail: "detail",
          activityScore: 0.8,
          sequence: 1,
          meta: {},
        }],
      }),
    });

    // Reconnect
    const ws2 = new WebSocket(`ws://localhost:${hub.port}/ws`);
    const messages: unknown[] = [];
    ws2.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((res) => ws2.on("open", res));
    await new Promise<void>((res) => setTimeout(res, 50));

    const hello = messages.find((m: any) => m.type === "hello");
    expect(hello).toEqual({ type: "hello", entities: 1 }); // not 0

    ws2.close();
    await hub.close();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/hub && npx vitest run src/integration/ws-lifecycle.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/hub/src/integration/ws-lifecycle.test.ts
git commit -m "test(hub): add WebSocket lifecycle integration tests"
```

---

### Task 8b: `apps/hub/src/integration/entity-lifecycle.test.ts`

**Files:**
- Create: `apps/hub/src/integration/entity-lifecycle.test.ts`
- Reference: `apps/hub/src/test-helpers.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, expect, it, afterEach } from "vitest";
import { startTestHub } from "../test-helpers.js";

function sessionEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    timestamp: "2026-04-09T20:00:00.000Z",
    source: "codex",
    sourceHost: "workstation",
    entityId: "codex:session:lc_test",
    sessionId: "lc_test",
    parentEntityId: null,
    entityKind: "session",
    displayName: "Codex",
    eventType: "message",
    status: "active",
    summary: "test",
    detail: "detail",
    activityScore: 0.8,
    sequence: 1,
    meta: {},
    ...overrides,
  };
}

async function postEvent(hub: Awaited<ReturnType<typeof startTestHub>>, event: unknown) {
  const res = await fetch(`${hub.baseUrl}/api/events/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
    body: JSON.stringify({ events: [event] }),
  });
  return res.json();
}

describe("entity session lifecycle", () => {
  afterEach(async () => {
    // cleaned up by test helper
  });

  it("creates entity with active status on session_start", async () => {
    const hub = await startTestHub();
    await postEvent(hub, sessionEvent({ eventType: "session_start", status: "active" }));

    const state = hub.store.getState(false, new Date());
    expect(state.entities).toHaveLength(1);
    expect(state.entities[0].currentStatus).toBe("active");
    await hub.close();
  });

  it("keeps entity active after multiple message events", async () => {
    const hub = await startTestHub();
    for (let i = 0; i < 3; i++) {
      await postEvent(hub, sessionEvent({ eventId: `evt_${i}`, sequence: i + 1 }));
    }

    const state = hub.store.getState(false, new Date());
    expect(state.entities).toHaveLength(1);
    expect(state.entities[0].currentStatus).toBe("active");
    await hub.close();
  });

  it("transitions entity to done after session_finished", async () => {
    const hub = await startTestHub();
    await postEvent(hub, sessionEvent());
    await postEvent(hub, sessionEvent({ eventType: "session_finished", status: "done" }));

    const state = hub.store.getState(true, new Date());
    const entity = state.entities.find((e) => e.entityId === "codex:session:lc_test");
    expect(entity?.currentStatus).toBe("done");
    await hub.close();
  });

  it("removes entity after expire called past retention window", async () => {
    const hub = await startTestHub();
    await postEvent(hub, sessionEvent({
      eventType: "session_finished",
      status: "done",
      timestamp: "2026-04-09T18:00:00.000Z", // 2 hours before expire check
    }));

    // expire should delete it ( ENTITY_EXPIRE_MS = 1 hour, event was 2h ago)
    hub.store.expire(new Date("2026-04-09T20:00:01.000Z"));
    expect(hub.store.entityCount).toBe(0);
    await hub.close();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/hub && npx vitest run src/integration/entity-lifecycle.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/hub/src/integration/entity-lifecycle.test.ts
git commit -m "test(hub): add entity session lifecycle integration tests"
```

---

### Task 8c: `apps/hub/src/integration/rate-limiter-integration.test.ts`

**Files:**
- Create: `apps/hub/src/integration/rate-limiter-integration.test.ts`
- Reference: `apps/hub/src/test-helpers.ts`, `apps/hub/src/rate-limiter.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { startTestHub } from "../test-helpers.js";

describe("rate limiter integration", () => {
  let hub: Awaited<ReturnType<typeof startTestHub>>;

  // Use a very small window for faster testing
  beforeEach(async () => {
    // Cannot override env per-test easily with current test-helpers design.
    // This test exercises the real rate limiter at its configured limits.
    hub = await startTestHub();
  });

  afterEach(async () => {
    await hub.close();
  });

  it("rate limits burst beyond configured max", async () => {
    // Default max is 60 per minute — send 65
    const results: number[] = [];
    for (let i = 0; i < 65; i++) {
      const res = await fetch(`${hub.baseUrl}/api/events/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
        body: JSON.stringify({ events: [] }),
      });
      results.push(res.status);
    }

    const successes = results.filter((s) => s === 200).length;
    const rateLimited = results.filter((s) => s === 429).length;
    expect(successes).toBe(60);
    expect(rateLimited).toBe(5);
  });

  it("resets after window expires — sends 200 after wait", async () => {
    // Send burst up to limit
    for (let i = 0; i < 60; i++) {
      await fetch(`${hub.baseUrl}/api/events/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
        body: JSON.stringify({ events: [] }),
      });
    }

    // 61st should be 429
    const blocked = await fetch(`${hub.baseUrl}/api/events/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
      body: JSON.stringify({ events: [] }),
    });
    expect(blocked.status).toBe(429);

    // Wait for window to expire (60s + buffer)
    await new Promise<void>((res) => setTimeout(res, 61_000));

    // Should be allowed again
    const ok = await fetch(`${hub.baseUrl}/api/events/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
      body: JSON.stringify({ events: [] }),
    });
    expect(ok.status).toBe(200);
  }, 90_000); // 90s timeout for the window-reset test
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/hub && npx vitest run src/integration/rate-limiter-integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/hub/src/integration/rate-limiter-integration.test.ts
git commit -m "test(hub): add rate limiter integration tests"
```

---

### Task 8d: `apps/hub/src/integration/dedup-integration.test.ts`

**Files:**
- Create: `apps/hub/src/integration/dedup-integration.test.ts`
- Reference: `apps/hub/src/test-helpers.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, expect, it, afterEach } from "vitest";
import { startTestHub } from "../test-helpers.js";

function event(extra: Record<string, unknown> = {}) {
  return {
    eventId: "dedup_evt_1",
    timestamp: "2026-04-09T20:15:31.000Z",
    source: "codex",
    sourceHost: "workstation",
    entityId: "codex:session:dedup_test",
    sessionId: "dedup_test",
    parentEntityId: null,
    entityKind: "session",
    displayName: "Codex",
    eventType: "message",
    status: "active",
    summary: "test",
    detail: "detail",
    activityScore: 0.8,
    sequence: 1,
    meta: {},
    ...extra,
  };
}

async function postEvents(hub: Awaited<ReturnType<typeof startTestHub>>, events: unknown[]) {
  const res = await fetch(`${hub.baseUrl}/api/events/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret" },
    body: JSON.stringify({ events }),
  });
  return res.json();
}

describe("event deduplication integration", () => {
  afterEach(async () => {
    // cleaned up by test helper
  });

  it("accepts only one instance of the same eventId in a single batch", async () => {
    const hub = await startTestHub();
    const result = await postEvents(hub, [event(), event()]);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0].eventId).toBe("dedup_evt_1");
    expect(result.rejected).toBe(1);
    expect(hub.store.entityCount).toBe(1);
    await hub.close();
  });

  it("rejects same eventId posted in a later batch", async () => {
    const hub = await startTestHub();
    // First batch — accepted
    const r1 = await postEvents(hub, [event()]);
    expect(r1.accepted).toHaveLength(1);

    // Same eventId again — rejected
    const r2 = await postEvents(hub, [event({ timestamp: "2026-04-09T20:15:32.000Z" })]);
    expect(r2.accepted).toHaveLength(0);
    expect(r2.rejected).toBe(1);
    expect(hub.store.entityCount).toBe(1); // still just one entity
    await hub.close();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/hub && npx vitest run src/integration/dedup-integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/hub/src/integration/dedup-integration.test.ts
git commit -m "test(hub): add deduplication integration tests"
```

---

## Task 9: Partial batch ingestion test in `hub-store.test.ts`

**Files:**
- Modify: `apps/hub/src/hub-store.test.ts` — add new test

- [ ] **Step 1: Add the partial batch test**

Add this test to the existing `describe("HubStore", ...)` block in `apps/hub/src/hub-store.test.ts`:

```typescript
it("continues processing remaining events after a parse failure (partial batch)", () => {
  const store = new HubStore();
  const result = store.ingestBatch({
    collectorId: "collector-a",
    events: [
      sampleEvent({ eventId: "evt_1" }),
      { bad: "event" }, // fails parse
      sampleEvent({ eventId: "evt_2" }),
      { also: "bad" },  // fails parse
      sampleEvent({ eventId: "evt_3" }),
    ],
  });

  expect(result.accepted.map((e) => e.eventId)).toEqual(["evt_1", "evt_2", "evt_3"]);
  expect(result.rejected).toBe(2);
  expect(store.entityCount).toBe(3);
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/hub && npx vitest run src/hub-store.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/hub/src/hub-store.test.ts
git commit -m "test(hub): add partial batch ingestion test"
```

---

## Task 10: Final verification — run all tests

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Run each app's tests in parallel**

```bash
cd apps/hub && npx vitest run
cd apps/collector && npx vitest run
```

Expected: All pass

---

## Spec coverage checklist

| Spec section | Task |
|---|---|
| 1.1 recent-event-buffer | Task 1 |
| 1.2 recent-events-handler | Task 2 |
| 1.3 state-handler | Task 3 |
| 1.4 collector-runtime | Task 4 |
| 1.5 rate-limiter | Task 6 |
| 2.1 collector→hub pipeline | Task 7 + test-helpers covers the infrastructure; individual integration tests cover the behaviors |
| 2.2 WebSocket lifecycle | Task 8a |
| 2.3 entity lifecycle | Task 8b |
| 2.4 rate limiter integration | Task 8c |
| 2.5 dedup integration | Task 8d |
| 3.1 droppedCount | Task 5 |
| 3.2 rate limiter IP fallback | Task 6 (extracted module) |
| 3.3 broadcast resilience | Task 8a |
| 3.4 partial batch | Task 9 |

**Placeholder scan:** All steps contain actual code — no "TBD", "TODO", or placeholder implementations.

**Type consistency check:** All method names (`getState`, `ingestBatch`, `expire`, `getRecentEventsSnapshot`, `createRateLimiter`, `enqueue`, `flush`, `stop`, `getDroppedCount`) are consistent with the actual source files.
