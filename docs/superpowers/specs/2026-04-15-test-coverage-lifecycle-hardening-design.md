# Test Coverage & Lifecycle Hardening

## Status

Approved for implementation.

## Scope

Comprehensive test coverage and lifecycle hardening across both the collector (event ingestion pipeline) and hub (central server).

---

## 1. Unit Tests for Uncovered Files

### 1.1 `recent-event-buffer.ts` (collector)

Test file: `apps/hub/src/recent-event-buffer.test.ts`

| Scenario | What to assert |
|----------|---------------|
| Deduplication | Same `eventId` added twice → second add returns `false`, buffer size unchanged |
| Circular wrap | Fill beyond `maxSize` → oldest event is evicted from buffer and ID set |
| Size tracking | After N adds (N < maxSize) → `size === N` |
| Snapshot order | Events returned in insertion order (oldest first) |
| Empty snapshot | No events added → snapshot returns `[]` |

### 1.2 `recent-events-handler.ts` (hub)

Test file: `apps/hub/src/recent-events-handler.test.ts`

| Scenario | What to assert |
|----------|---------------|
| Missing auth | No authorization header → 401 |
| Wrong token | Bearer wrong → 401 |
| Correct token | Returns `{ events }` with events array |
| Limit clamping | `?limit=0` → clamped to 1; `?limit=9999` → clamped to 500 |
| Default limit | No `?limit` → defaults to 100 |
| Empty store | Returns `{ events: [] }` |

### 1.3 `state-handler.ts` (hub)

Test file: `apps/hub/src/state-handler.test.ts`

| Scenario | What to assert |
|----------|---------------|
| `includeDormant=0` | Only active/idle/sleepy entities returned |
| `includeDormant=1` | All entities including dormant returned |
| Empty store | `entities: []` returned |
| Calls `store.getState` | With correct `includeDormant` and `now` args |

### 1.4 `collector-runtime.ts` (collector)

Test file: `apps/collector/src/collector-runtime.test.ts`

| Scenario | What to assert |
|----------|---------------|
| Enqueue overflow | Queue at MAX_QUEUE_SIZE, one more added → oldest event dropped, no error thrown |
| Flush empty queue | Nothing sent to hub |
| Flush retry on failure | `hubClient.postBodies` throws → queue restored, error propagates |
| Stop drains queue | `stop()` calls `flush()` after closing handles |
| Plugin onEvent throws | Error is swallowed, queue continues |
| Plugin onError called | Error handler is invoked with error message |

### 1.5 Hub `index.ts` rate limiter edge cases

Test file: `apps/hub/src/rate-limiter.test.ts`

| Scenario | What to assert |
|----------|---------------|
| First request in window | Allowed, counter set |
| Burst at limit | Final request → 429 |
| Window reset | After `windowMs` passes, counter resets, requests allowed again |
| `req.ip` undefined | Falls back to `x-forwarded-for` first value |
| `x-forwarded-for` also empty | Uses fallback string `'unknown'` |

---

## 2. Integration Tests

Test location: `apps/hub/src/integration/` (or `apps/hub-e2e/` if a separate package)

### 2.1 Collector → Hub pipeline

```
1. Start hub server on random available port.
2. Create HubClient pointing at hub.
3. Create CollectorRuntime with HubClient.
4. Runtime enqueues several events.
5. Trigger flush.
6. POST directly to hub's /api/events/batch.
7. Verify hub store has the entities.
```

### 2.2 WebSocket lifecycle

```
1. Start hub server.
2. Connect WebSocket client to /ws.
3. Verify hello message received with entity count.
4. Post an event batch via HTTP.
5. Verify WebSocket receives the updated state broadcast.
6. Close client socket.
7. Verify server does not throw on broadcast to closed client.
8. Reconnect client.
9. Verify hello message has current entity count (not reset incorrectly).
```

### 2.3 Entity session lifecycle

```
1. Start with empty hub store.
2. Post session_start event → entity created with status "active".
3. Post 3 message events → entity still "active".
4. Post session_finished event → entity status "done".
5. Advance clock past ENTITY_EXPIRE_MS.
6. Call expire().
7. Verify entity is removed from store.
```

### 2.4 Rate limiter integration

```
1. Start hub server.
2. Send burst of (rateLimitMax + 5) requests from same IP.
3. First rateLimitMax succeed with 200.
4. Next 5 receive 429 with { error: "rate_limited" }.
5. Wait for window to expire.
6. Send one more → succeeds with 200.
```

### 2.5 Deduplication integration

```
1. Start hub with RecentEventBuffer maxSize large enough.
2. Post same event ID twice in the same batch.
3. Verify only one event accepted (store entityCount = 1).
4. Post same event ID in a later batch.
5. Verify it is rejected (RecentEventBuffer already saw it).
```

---

## 3. Lifecycle Hardening (Small Fixes)

### 3.1 CollectorRuntime enqueue overflow metric

**File:** `apps/collector/src/collector-runtime.ts`

When the queue overflows, the oldest event is silently dropped via `queue.shift()`. Add a `droppedCount` counter incremented each time this happens, and expose it via a `getDroppedCount()` method so monitoring can observe queue pressure.

### 3.2 Rate limiter IP fallback robustness

**File:** `apps/hub/src/index.ts`

The current code does `req.ip || (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim()`. When `req.ip` is `undefined` and `x-forwarded-for` is absent, this falls back to empty string. Use a named fallback string (`'unknown'`) and ensure the rate limiter still works in that case. No functional change — just clarity and safety.

### 3.3 Broadcast resilience test

**File:** `apps/hub/src/integration/ws-lifecycle.test.ts`

Add a specific assertion: simulate a WebSocket client that throws on `send()`. Verify other clients still receive the message and the broadcasting loop does not stop.

### 3.4 Partial batch ingestion clarity

**File:** `apps/hub/src/hub-store.ts`

The current `ingestBatch` loops through events and skips parse failures silently. Confirm this behavior in a test: a batch of 10 events where 3 fail to parse → 7 accepted, 3 rejected. The store should continue processing remaining events after a failure.

---

## 4. File Map

```
apps/hub/src/
  recent-event-buffer.test.ts       [NEW]
  recent-events-handler.test.ts     [NEW]
  state-handler.test.ts             [NEW]
  rate-limiter.test.ts              [NEW]
  integration/
    collector-hub-pipeline.test.ts  [NEW]
    ws-lifecycle.test.ts            [NEW]
    entity-lifecycle.test.ts        [NEW]
    rate-limiter.test.ts           [NEW]
    dedup.test.ts                  [NEW]

apps/collector/src/
  collector-runtime.test.ts        [NEW]

apps/hub/src/collector-runtime.ts  [MODIFIED: droppedCount]
apps/hub/src/index.ts              [MODIFIED: rate limiter IP fallback]
apps/hub/src/hub-store.test.ts      [MODIFIED: partial batch test]
```

---

## 5. Dependencies

- `ws` — already in hub's dependencies, used for integration WebSocket tests
- `supertest` or raw `http` — for integration HTTP tests
- No new runtime dependencies added
