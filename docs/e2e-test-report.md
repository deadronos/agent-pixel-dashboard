# End-to-End Test Report

**Date:** April 14, 2026
**Tester:** Automated review

## Services Tested

| Service   | Port | Status     |
| --------- | ---- | ---------- |
| Hub       | 3032 | ✅ Running |
| Collector | —    | ✅ Running |
| Dashboard | 5173 | ✅ Running |

## Test Sequence

### 1. Hub Startup

```
hub listening on http://localhost:3032
```

- Auth token validated
- WebSocket server on `/ws`
- REST endpoints available

### 2. Collector Startup

```
[claude] watching /Users/openclaw/.claude/projects
[claude] watching /Users/openclaw/.claude
[claude] watching 2 root(s)
[codex] watching /Users/openclaw/.codex/sessions
[codex] watching /Users/openclaw/.codex
[codex] watching 2 root(s)
[copilot] watching /Users/openclaw/.copilot/session-state
[copilot] watching /Users/openclaw/.copilot
[copilot] watching 2 root(s)
[gemini] watching /Users/openclaw/.gemini/tmp
[gemini] watching /Users/openclaw/.gemini
[gemini] watching 2 root(s)
[openclaw] watching /Users/openclaw/.openclaw/agents
[openclaw] watching /Users/openclaw/.openclaw
[openclaw] watching 2 root(s)
```

Watched sources: claude, codex, copilot, gemini, openclaw (6 sources total)

### 3. Dashboard Startup

```
VITE v7.3.2 ready in 121 ms
  ➜  Local:   http://localhost:5173/
```

### 4. Data Flow Verification

Hub health check:

```json
{ "ok": true, "entities": 1, "recentEvents": 1 }
```

Hub state endpoint returned entity:

```json
{
  "entityId": "openclaw:session:openclaw:teleclaw:c11cefd4",
  "source": "openclaw",
  "sourceHost": "localhost",
  "displayName": "teleclaw",
  "entityKind": "session",
  "sessionId": "openclaw:teleclaw:c11cefd4",
  "currentStatus": "sleepy",
  "lastEventAt": "2026-04-14T19:47:41.663Z",
  "lastSummary": "assistant",
  "activityScore": 0.6
}
```

## Dashboard UI Verification

- Title: "Agent Watch Dashboard"
- Header: "Tracking 1 conversations. Latest activity at 21:47."
- Summary counts: 1 Total, 0 Active, 0 Idle, 0 Dormant
- Live indicator: "Latest event 21:47."
- Settings panel accessible with filters for sources and entity kinds
- Entity tile displayed: "teleclaw" with "Sleepy" status

## Known Issues

### Non-blocking

| Issue                    | Severity | Description                                                                                                                                                                                                                                      |
| ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WebSocket race condition | Low      | On initial load, dashboard shows warning: `WebSocket connection to 'ws://localhost:3032/ws' failed: WebSocket is closed before the connection is established`. Dashboard recovers automatically by falling back to HTTP polling of `/api/state`. |

## Conclusion

**Status: PASS**

All three services start correctly, communicate properly, and the dashboard successfully displays live entity data from the collector through the hub. The WebSocket race condition is cosmetic and does not affect functionality.
