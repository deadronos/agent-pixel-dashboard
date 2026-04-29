# Agent Watch Dashboard (Watcher-First MVP)

Watcher-first multi-agent observability stack from `idea.md`:

- `apps/collector`: watches local transcript/session files and emits normalized events
- `apps/hub`: receives event batches, projects entity state, serves state/detail/search APIs, and streams updates over WebSocket
- `apps/dashboard`: renders live entity tiles with activity-state decay
- `plugins/plugin-codex-watch`: codex-oriented JSONL watcher plugin
- `plugins/plugin-claude-watch`: claude session/transcript watcher plugin
- `plugins/plugin-gemini-watch`: gemini-cli session/transcript watcher plugin
- `plugins/plugin-openclaw-watch`: openclaw session/transcript watcher plugin
- `plugins/plugin-copilot-watch`: copilot-cli session/transcript watcher plugin
- `plugins/plugin-opencode-watch`: OpenCode watcher plugin, preferring live SQLite state with JSON fallback
- `plugins/plugin-hermes-watch`: Hermes agent session/transcript watcher plugin
- `plugins/plugin-pi-watch`: Pi coding agent JSONL watcher plugin
- `packages/env-loader`: loads repo-root `.env` / `.env.local` for hub and collector
- `packages/event-schema`: canonical runtime schema for normalized events
- `packages/plugin-sdk`: collector/plugin contracts and session-file matching helpers
- optional CASS-backed session search at `GET /api/search/sessions`

## Quick start

```bash
npm install
HUB_AUTH_TOKEN=dev-secret npm run dev:hub
```

In another shell:

```bash
HUB_AUTH_TOKEN=dev-secret npm run dev:collector
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
- `HUB_RATE_LIMIT_WINDOW_MS` (default: `60000`, rate-limit window for `POST /api/events/batch`)
- `HUB_RATE_LIMIT_MAX` (default: `60`, max batches allowed per window)
- `HUB_CORS_ORIGINS` (optional comma-separated allowlist of dashboard origins; blank is
  permissive during development and rejects cross-origin requests in `NODE_ENV=production`)

### Collector

- `COLLECTOR_ID` (default: `collector-<hostname>`)
- `COLLECTOR_HOST` (default: system hostname)
- `HUB_URL` (default: `http://localhost:3030`)
- `HUB_AUTH_TOKEN` (must match hub token)
- `FLUSH_INTERVAL_MS` (default: `500`)
- `MAX_BATCH_BYTES` (default: `1500000`, keep below hub JSON body limit)
- `WATCH_SOURCES` (default: `auto`; use `auto|all` or comma-separated sources)
- `PLUGINS_DIR` (optional; defaults to repo `plugins/` directory for autodiscovery)
- `SESSION_ROOTS` (optional comma-separated global roots used in addition to source-specific roots)
- `CODEX_SESSION_ROOTS` (optional comma-separated session roots)
- `CLAUDE_SESSION_ROOTS` (optional comma-separated session roots)
- `GEMINI_SESSION_ROOTS` (optional comma-separated session roots)
- `OPENCLAW_SESSION_ROOTS` (optional comma-separated session roots)
- `COPILOT_SESSION_ROOTS` (optional comma-separated session roots)
- `OPENCODE_DATA_DIR` (optional OpenCode data directory; default `~/.local/share/opencode`)
- `HERMES_DIR` (optional Hermes directory; default `~/.hermes`)
- `PI_SESSION_ROOTS` (optional comma-separated Pi session roots)

### Optional Watcher Tuning

- `CODEX_ACTIVE_WINDOW_MS` (default: `120000`)
- `CLAUDE_ACTIVE_WINDOW_MS` (default: `120000`)
- `GEMINI_ACTIVE_WINDOW_MS` (default: `120000`)
- `OPENCLAW_ACTIVE_WINDOW_MS` (default: `120000`)
- `OPENCLAW_SCAN_INTERVAL_MS` (default: `15000`)
- `OPENCLAW_SCAN_MAX_DEPTH` (default: `8`)
- `OPENCLAW_SCAN_MAX_FILES` (default: `5000`)
- `COPILOT_ACTIVE_WINDOW_MS` (default: `120000`)
- `COPILOT_SCAN_INTERVAL_MS` (default: `2000`)
- `COPILOT_SCAN_MAX_DEPTH` (default: `2`)
- `COPILOT_SCAN_MAX_FILES` (default: `5000`)
- `OPENCODE_ACTIVE_WINDOW_MS` (default: `120000`)
- `OPENCODE_SCAN_INTERVAL_MS` (default: `2000`)
- `HERMES_ACTIVE_WINDOW_MS` (default: `120000`)
- `PI_ACTIVE_WINDOW_MS` (default: `120000`)

## CASS integration

Hub endpoint:

- `GET /api/search/sessions?q=<query>&limit=<n>`

Behavior:

- uses `cass search ... --robot --fields minimal`
- rejects blank, oversized, or control-character queries before invoking CASS
- returns `503` if CASS is unavailable (`cass health --json` fails)

This keeps search pluggable while letting collectors stay watcher-first.
