# Agent Watch Dashboard (Watcher-First MVP)

Watcher-first multi-agent observability stack from `idea.md`:

- `apps/collector`: watches local transcript/session files and emits normalized events
- `apps/hub`: receives event batches, projects entity state, streams updates over WebSocket
- `apps/dashboard`: renders live entity tiles with activity-state decay
- `plugins/plugin-codex-watch`: codex-oriented JSONL watcher plugin
- optional CASS-backed session search at `GET /api/search/sessions`

## Quick start

```bash
npm install
npm run dev:hub
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

## Environment variables

### Hub

- `HUB_PORT` (default: `3030`)
- `HUB_AUTH_TOKEN` (default: `dev-secret`)
- `CASS_BIN` (default: `cass`)

### Collector

- `COLLECTOR_ID` (default: `collector-<hostname>`)
- `COLLECTOR_HOST` (default: system hostname)
- `HUB_URL` (default: `http://localhost:3030`)
- `HUB_AUTH_TOKEN` (must match hub token)
- `FLUSH_INTERVAL_MS` (default: `500`)
- `CODEX_SESSION_ROOTS` (comma-separated session roots)

## CASS integration

Hub endpoint:

- `GET /api/search/sessions?q=<query>&limit=<n>`

Behavior:

- uses `cass search ... --robot --fields minimal`
- returns `503` if CASS is unavailable (`cass health --json` fails)

This keeps search pluggable while letting collectors stay watcher-first.
