# Codebase Review: Problems & Issues

**Date:** 2026-04-11
**Branch:** main

---

## 1. CRITICAL Issues

### 1.1 Hardcoded `codexRoots` Only for Codex Plugin
**File:** `apps/collector/src/index.ts:63`
```typescript
const roots = await plugin.discover({
  host: config.hostName,
  configuredRoots: plugin.source === "codex" ? config.codexRoots : [],  // BUG: only codex gets configuredRoots
  env: process.env
});
```
All other plugins (copilot, claude, gemini, openclaw) receive empty `configuredRoots` even when collector config has `codexRoots` defined. Inconsistent behavior—other plugins only get env var overrides.

### 1.2 Queue Can Grow Unbounded
**File:** `apps/collector/src/index.ts:16`
```typescript
const queue: NormalizedEvent[] = [];
```
No maximum size. If hub is unreachable, events accumulate indefinitely. Should implement `MAX_QUEUE_SIZE` with oldest-event dropping or flush-on-overflow.

### 1.3 Default Auth Token in Production Code
**File:** `apps/hub/src/index.ts:20`
```typescript
const authToken = process.env.HUB_AUTH_TOKEN ?? "dev-secret";
```
Defaults to `"dev-secret"` if no auth token configured. Security risk—should require explicit token.

### 1.4 CORS Wide Open
**File:** `apps/hub/src/index.ts:17`
```typescript
app.use(cors());  // BUG: allows any origin
```
No CORS configuration, accepts requests from any origin. Should restrict to specific trusted origins.

### 1.5 Hub WebSocket Broadcast Silently Swallows Errors
**File:** `apps/hub/src/index.ts:75-86`
```typescript
try {
  client.send(encoded);
} catch {
  // Ignore individual socket failures and keep broadcasting.
}
```
Individual socket failures are silently ignored, making debugging difficult. Failed sends should be logged.

### 1.6 Hub Doesn't Send Full State to New WebSocket Clients
**File:** `apps/hub/src/index.ts:191-193`
```typescript
wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "hello", entities: entities.size }));
});
```
Only sends entity count, not actual state. Race condition exists between WebSocket connect and HTTP state fetch.

### 1.7 Hub Entity Map Never Removes Entities (Memory Leak)
**File:** `apps/hub/src/index.ts:26`
```typescript
const entities = new Map<string, EntityState>();
```
Entities are added but never removed. Map grows indefinitely. Should implement entity expiration or archival.

---

## 2. MODERATE Issues

### 2.1 openclaw Plugin Uses Polling Instead of Chokidar
**File:** `plugins/plugin-openclaw-watch/src/index.ts:260`
```typescript
const timer = setInterval(() => {
  void scan();
}, Number.isFinite(scanIntervalMs) ? scanIntervalMs : DEFAULT_SCAN_INTERVAL_MS);
```
Uses `setInterval` polling while other plugins use `chokidar`. Architecturally inconsistent and uses more CPU.

### 2.2 openclaw Plugin Has Subtle File Handle Bug
**File:** `plugins/plugin-openclaw-watch/src/index.ts:155-197`
```typescript
try {
  const previousOffset = offsets.get(filePath) ?? 0;
  const handle = await fs.open(filePath, "r");
  try {
    // ... read logic ...
  } finally {
    await handle.close();  // BUG: handle may be undefined if fs.open threw
  }
} catch (error) {
  ctx.onError(error as Error);
}
```
If `fs.open` throws, `handle` is never assigned but `finally` still runs and tries `await handle.close()` where `handle` is `undefined`. Original error is replaced.

### 2.3 SettingsPanel Hover Behavior is Unusual
**File:** `apps/dashboard/src/SettingsPanel.tsx:48-51`
```typescript
<div
  className="settings-panel__container"
  onMouseEnter={() => setOpen(true)}
  onMouseLeave={() => setOpen(false)}
>
```
Opens on mouseEnter, closes on mouseLeave. Unusual UX—users may accidentally trigger panel. Standard toggle button is more predictable.

### 2.4 Invalid Palette Throws During Render
**File:** `apps/dashboard/src/visual-profile.ts:72-81`
```typescript
function resolvePalette(...): ProviderPalette {
  if (!isNamedPaletteId(themePalette)) {
    throw new Error(`Unknown palette id: ${themePalette}`);  // BUG: throws during render
  }
  return getNamedPalette(themePalette);
}
```
Invalid palette ID throws during React render. Not caught by error boundaries, will crash component. Should return fallback palette.

### 2.5 CASS Search Returns 500 Instead of 503 on Timeout
**File:** `apps/hub/src/index.ts:183-188`
```typescript
} catch (error) {
  res.status(500).json({
    error: "search_failed",
    message: error instanceof Error ? error.message : "unknown error"
  });
}
```
Timeout/unavailability should return 503 Service Unavailable, not 500 Internal Server Error.

### 2.6 Port Conflict Not Handled
**File:** `apps/hub/src/index.ts:195-198`
```typescript
const port = Number(process.env.HUB_PORT ?? 3030);
server.listen(port, () => {
  console.log(`hub listening on http://localhost:${port}`);
});
```
If port is in use (`EADDRINUSE`), process crashes with unhandled error. Should handle gracefully.

### 2.7 Collector Shutdown Exits 0 Even on Flush Failure
**File:** `apps/collector/src/index.ts:103-111`
```typescript
const shutdown = async (): Promise<void> => {
  clearInterval(timer);
  await Promise.all(handles.map((handle) => handle.close()));
  try {
    await flushQueue();
  } finally {
    process.exit(0);  // BUG: exits 0 even if flushQueue failed
  }
};
```
If `flushQueue()` fails, process still exits with code 0. Events could be lost without indication.

### 2.8 parseEnvFile Doesn't Handle Escape Sequences
**File:** `apps/collector/src/env.ts:24-29`
```typescript
if (
  (value.startsWith('"') && value.endsWith('"')) ||
  (value.startsWith("'") && value.endsWith("'"))
) {
  value = value.slice(1, -1);
}
```
Strips quotes but doesn't handle escape sequences like `\n`, `\t`, or `\\`. Values with escapes won't parse correctly.

### 2.9 Numeric Env Vars Don't Validate Properly
**File:** `apps/collector/src/config.ts:21-22`
```typescript
flushIntervalMs: Number(env.FLUSH_INTERVAL_MS ?? 500),
maxBatchBytes: Number(env.MAX_BATCH_BYTES ?? 1_500_000),
```
Using `Number()` returns `NaN` for invalid inputs without falling back to defaults. Should use `Number.isFinite()`.

### 2.10 Plugin Loading Errors Are Only Warned
**File:** `apps/collector/src/plugin-loader.ts:41-44`
```typescript
} catch (error) {
  console.warn(`[collector] failed to load ${pkgName}:`, error instanceof Error ? error.message : String(error));
}
```
Missing plugins could cause confusion at runtime. Should either fail fast or have explicit plugin availability check.

### 2.11 No Input Sanitization for CASS Search Query
**File:** `apps/hub/src/index.ts:162`
```typescript
const query = String(req.query.q ?? "").trim();
```
Query passed directly to CASS without sanitization. Should be explicit to prevent potential injection.

### 2.12 DashboardEntity recentEvents Never Gets Populated
**File:** `apps/dashboard/src/App.tsx:98-112`
```typescript
next.set(eventItem.entityId, {
  // ...
  recentEvents: prev?.recentEvents ?? []  // Always empty - never from server
});
```
`recentEvents` field always initialized to empty. Server sends it (`apps/hub/src/state.ts:17`) but dashboard doesn't use it.

### 2.13 resolveLiveStatus Ignores activityScore
**File:** `apps/dashboard/src/face.ts:195-201`
```typescript
export function resolveLiveStatus(currentStatus: EntityStatus | undefined, lastEventAt: string): EntityStatus {
  if (currentStatus === "done" || currentStatus === "error") {
    return currentStatus;
  }
  return getStatusFromTimestamp(lastEventAt);  // Ignores activityScore entirely
}
```
`activityScore` computed by plugins but never used in status determination. Should be used for UI prioritization.

---

## 3. MINOR Issues / Code Quality

### 3.1 DashboardEntity Interface Duplicated
**Files:** `apps/dashboard/src/face.ts:61` and `apps/dashboard/src/dashboard-view.ts:5`
Defined in two places with different field sets. Should be consolidated.

### 3.2 getBestMatchingRule Prefers Later Rules on Tie
**File:** `apps/dashboard/src/visual-profile.ts:62`
```typescript
if (specificity > bestSpecificity || (specificity === bestSpecificity && index > bestIndex)) {
```
When specificity ties, prefers later rule. Typically earlier rules are preferred for predictability.

### 3.3 Event Deduplication Uses Only eventId
**File:** `apps/hub/src/index.ts:44`
```typescript
if (recentEventIds.has(event.eventId)) {
  return false;
}
```
Deduplication relies solely on `eventId`. Deterministic generation means two events with same ID are duplicates even with different content.

### 3.4 collectorId Not Validated in Hub
**File:** `apps/hub/src/index.ts:98`
```typescript
const body = req.body as IngestBatchBody;
```
`collectorId` field not validated. Malicious collectors could send arbitrary strings.

### 3.5 flushQueue Could Have Race Condition
**File:** `apps/collector/src/index.ts:19-48`
```typescript
async function flushQueue(): Promise<void> {
  if (queue.length === 0) return;
  const payload = queue.splice(0, queue.length);
  // ...
  } catch (error) {
    queue.unshift(...payload);  // re-queue on failure
  }
}
```
Multiple simultaneous flushes could cause issues. Should use mutex or similar.

### 3.6 No WebSocket Heartbeat Mechanism
**File:** `apps/hub/src/index.ts:191-193`
WebSocket connection handler doesn't implement ping/heartbeat to detect stale connections.

### 3.7 No Rate Limiting on Hub Endpoints
Hub has no rate limiting. Misbehaving collector could overwhelm it.

---

## 4. Missing Pieces / Incomplete Implementations

| Item | Description |
|------|-------------|
| Persistent state in hub | Purely in-memory; no SQLite or file-based persistence |
| Offset persistence | File offsets lost on restart (openclaw tracks in memory only) |
| Real session parsing tests | Tests use mock data, not real transcript fixtures |
| Authentication mechanism | Just bearer token check, no per-collector allowlist |
| Structured logging | Just console.log/error |
| Observability | No Prometheus metrics, structured logs, or tracing |
| CASS integration | `/api/search/sessions` returns 503 if CASS isn't installed |

---

## 5. Security Concerns

| Issue | File | Risk |
|-------|------|------|
| Default "dev-secret" token | `apps/hub/src/index.ts:20` | Unauthorized access |
| CORS wide open | `apps/hub/src/index.ts:17` | Cross-origin attacks |
| No input sanitization for CASS | `apps/hub/src/index.ts:162` | Potential injection |
| No collector ID allowlisting | `apps/hub/src/index.ts:98` | Any collector with token can connect |
| No TLS support | All HTTP/WebSocket | Plain text communication |

---

## 6. Performance Issues

| Issue | File | Impact |
|-------|------|--------|
| openclaw polling uses setInterval | `plugins/plugin-openclaw-watch/src/index.ts:260` | Excessive CPU usage |
| No batching at plugin level | All plugins | Inefficient event processing |
| Queue has no size limit | `apps/collector/src/index.ts:16` | Memory exhaustion |
| WebSocket broadcasts O(n) | `apps/hub/src/index.ts:75-86` | Slow at scale |
| No backpressure handling | Collector/Hub | Memory/express queue buildup |

---

## 7. Summary by File

| File | Issues |
|------|--------|
| `apps/collector/src/index.ts` | 1.1, 1.2, 2.7, 3.5 |
| `apps/collector/src/env.ts` | 2.8 |
| `apps/collector/src/config.ts` | 2.9 |
| `apps/collector/src/plugin-loader.ts` | 2.10 |
| `apps/hub/src/index.ts` | 1.3, 1.4, 1.5, 1.6, 1.7, 2.5, 2.6, 2.11, 2.4, 3.3, 3.4, 3.6, 3.7 |
| `apps/hub/src/state.ts` | 2.12 |
| `apps/dashboard/src/App.tsx` | 2.12 |
| `apps/dashboard/src/face.ts` | 2.13, 3.1 |
| `apps/dashboard/src/SettingsPanel.tsx` | 2.3 |
| `apps/dashboard/src/visual-profile.ts` | 2.4, 3.2 |
| `apps/dashboard/src/dashboard-view.ts` | 3.1 |
| `plugins/plugin-openclaw-watch/src/index.ts` | 2.1, 2.2 |
