# Agent Watch Dashboard (Watcher-First MVP)

Watcher-first multi-agent observability stack from `idea.md`:

- `apps/collector`: watches local transcript/session files and emits normalized events
- `apps/hub`: receives event batches, projects entity state, streams updates over WebSocket
- `apps/dashboard`: renders live entity tiles with activity-state decay
- `plugins/plugin-codex-watch`: codex-oriented JSONL watcher plugin
- `plugins/plugin-claude-watch`: claude session/transcript watcher plugin
- `plugins/plugin-gemini-watch`: gemini-cli session/transcript watcher plugin
- `plugins/plugin-openclaw-watch`: openclaw session/transcript watcher plugin
- `plugins/plugin-copilot-watch`: copilot-cli session/transcript watcher plugin
- optional CASS-backed session search at `GET /api/search/sessions`

## Quick start

```bash
npm install
npm run dev:hub
```

In another shell:

```bash
HUB_AUTH_TOKEN=<your-token> npm run dev:collector
```

In another shell:

```bash
npm run dev:dashboard
```

Open `http://localhost:5173`.

The dashboard dev server binds to `0.0.0.0`, so you can also open it from another device on the same LAN
using the machine's hostname or IP address.

Local overrides live in the repo-root `.env.local`, which is loaded by the hub, collector, and dashboard.

If you run the dashboard on a different host or port than the hub, set `HUB_CORS_ORIGINS` on the hub
to the dashboard origin(s). The dashboard derives its websocket URL from `VITE_HUB_HTTP` unless
`VITE_HUB_WS` is set explicitly.

## Environment variables

### Dashboard

- `VITE_HUB_HTTP` (default: `http://localhost:3030`)
- `VITE_HUB_WS` (optional; leave blank to derive `ws://` or `wss://` from `VITE_HUB_HTTP`)

### Hub

- `HUB_PORT` (default: `3030`)
- `HUB_AUTH_TOKEN` (required; must match the collector token)
- `CASS_BIN` (default: `cass`)
- `HUB_CORS_ORIGINS` (optional comma-separated allowlist of dashboard origins; leave blank for
  permissive development, or set an allowlist in deployment)

### Collector

- `COLLECTOR_ID` (default: `collector-<hostname>`)
- `COLLECTOR_HOST` (default: system hostname)
- `HUB_URL` (default: `http://localhost:3030`)
- `HUB_AUTH_TOKEN` (must match hub token)
- `FLUSH_INTERVAL_MS` (default: `500`)
- `MAX_BATCH_BYTES` (default: `1500000`, keep below hub JSON body limit)
- `WATCH_SOURCES` (default: `auto`; use `auto|all` or comma-separated sources)
- `PLUGINS_DIR` (optional; defaults to repo `plugins/` directory for autodiscovery)
- `SESSION_ROOTS` (optional comma-separated global override for all source watchers; falls back to `CODEX_SESSION_ROOTS` for compatibility)
- `CODEX_SESSION_ROOTS` (optional comma-separated session roots)
- `CLAUDE_SESSION_ROOTS` (optional comma-separated session roots)
- `GEMINI_SESSION_ROOTS` (optional comma-separated session roots)
- `OPENCLAW_SESSION_ROOTS` (optional comma-separated session roots)
- `COPILOT_SESSION_ROOTS` (optional comma-separated session roots)

### Optional Watcher Tuning

- `CODEX_ACTIVE_WINDOW_MS` (default: `120000`)
- `CLAUDE_ACTIVE_WINDOW_MS` (default: `120000`)
- `GEMINI_ACTIVE_WINDOW_MS` (default: `120000`)
- `OPENCLAW_ACTIVE_WINDOW_MS` (default: `120000`)
- `OPENCLAW_SCAN_INTERVAL_MS` (default: `15000`)
- `OPENCLAW_SCAN_MAX_DEPTH` (default: `8`)
- `OPENCLAW_SCAN_MAX_FILES` (default: `5000`)
- `COPILOT_ACTIVE_WINDOW_MS` (default: `120000`)

## CASS integration

Hub endpoint:

- `GET /api/search/sessions?q=<query>&limit=<n>`

Behavior:

- uses `cass search ... --robot --fields minimal`
- returns `503` if CASS is unavailable (`cass health --json` fails)

This keeps search pluggable while letting collectors stay watcher-first.
