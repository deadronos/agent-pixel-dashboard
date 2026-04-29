# Copilot instructions for Agent Watch

## Commands

- Install dependencies: `npm install`
- Build everything: `npm run build`
- Test everything: `npm run test`
- Lint everything: `npm run lint`
- Run a single test: `npm --workspace @agent-watch/dashboard test -- src/face.test.ts`
  - Use the workspace package name and pass a test file path after `--`.
  - The same pattern works for `@agent-watch/hub`, `@agent-watch/collector`, `@agent-watch/event-schema`, and `@agent-watch/plugin-sdk`.
- Run locally:
  - Hub: `HUB_AUTH_TOKEN=dev-secret npm run dev:hub`
  - Collector: `HUB_AUTH_TOKEN=dev-secret npm run dev:collector`
  - Dashboard: `npm run dev:dashboard`

## Architecture

- This is a TypeScript monorepo with three apps:
  - `apps/collector`: discovers session roots, watches JSONL/session files, normalizes source events, and batches them to the hub.
  - `apps/hub`: accepts authenticated event batches, dedupes by `eventId`, projects entity state, and broadcasts updates over WebSocket.
  - `apps/dashboard`: consumes hub state and live events, then renders the visual entity cards and settings UI.
- Shared packages:
  - `packages/env-loader` loads repo-root `.env` / `.env.local` for hub and collector.
  - `packages/event-schema` is the canonical runtime schema for normalized events.
  - `packages/plugin-sdk` defines collector/plugin contracts and session-file matching helpers.
- Source-specific adapters live under `plugins/plugin-<source>-watch`; they discover roots, tail source files, and emit normalized events into the shared schema.
- Data flow is collector -> hub -> dashboard. Keep source parsing in plugins, not in the hub or dashboard.

## Conventions

- Use ESM-style imports with explicit `.js` extensions in TypeScript files.
- Validate external or cross-package payloads with `parseNormalizedEvent`/Zod before use.
- Prefer deterministic event IDs from `makeDeterministicEventId` for file-derived records; the hub dedupes on `eventId`.
- Collector plugins should tolerate missing roots and malformed partial JSONL lines, skipping bad records instead of failing the whole watch loop.
- Session/path matching is source-specific but should normalize path separators and support configured roots plus `~` expansion.
- Dashboard state is derived from `lastEventAt` and decays through `active -> idle -> sleepy -> dormant`; keep that logic separate from rendering.
- Keep responsibilities split by file:
  - `face.ts` for status/mood/palette helpers
  - `visual-profile.ts` for rule matching
  - `dashboard-view.ts` for filtering, sorting, and layout helpers
- Viewer preferences are stored in localStorage and sanitized before use.
- Hub ingest at `POST /api/events/batch` requires the bearer token from `HUB_AUTH_TOKEN`.
