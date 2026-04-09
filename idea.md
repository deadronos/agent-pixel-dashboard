# Agent Watch Dashboard — watcher-first idea

## One-line concept
A split, watcher-first multi-agent visualization system:
- **collectors** run on source hosts and watch local session/transcript folders
- a central **hub** receives normalized events over HTTP/WebSocket
- a **dashboard** renders those events as animated agent entities in real time

This project is intended to support tools like:
- Codex CLI
- GitHub Copilot CLI
- OpenClaw
- Gemini CLI
- future local or remote agent runtimes

The key design choice is:

> **Do not depend on tool-specific hooks as the primary integration surface.**
> Use local transcript/session watching first. Treat hooks as optional enrichers later.

---

## Why watcher-first
Most non-ephemeral agent sessions leave persistent traces somewhere on disk:
- session metadata
- JSONL transcripts
- event logs
- checkpoints or resumable state

That makes filesystem-backed collection attractive because it is:
- less invasive than hooking every CLI directly
- easier to retrofit onto existing agent workflows
- robust for local-first tools
- easier to debug when something breaks
- more portable across tools with very different hook maturity

Hooks can still be added later to improve latency and precision, but the base system should work without them.

---

## Product goal
Build a dashboard that can display active agent sessions as living entities:
- one entity per tracked session or sub-agent
- dynamic layout for 1–8 active entities
- animated “face/state” visualization
- state decay over time when activity stops
- optional drill-down into recent transcript-derived events

The dashboard should feel ambient and alive, but still be useful as a debugging/observability surface.

---

## High-level architecture

```text
+----------------------+      +-------------------------+      +----------------------+
| Source host A        |      | Central Hub / Receiver  |      | Dashboard client     |
|----------------------|      |-------------------------|      |----------------------|
| collector            | ---> | ingest API             | ---> | websocket subscriber |
| watcher plugins      |      | entity state cache     |      | layout engine        |
| transcript parsers   |      | recent event store     |      | animation system     |
| optional enrichers   |      | live stream            |      | transcript detail UI |
+----------------------+      +-------------------------+      +----------------------+

+----------------------+
| Source host B        |
|----------------------|
| collector            |
| watcher plugins      |
| transcript parsers   |
| optional enrichers   |
+----------------------+
```

### Roles

#### 1. Collector
Runs locally on each machine that produces agent sessions.

Responsibilities:
- discover session roots for supported tools
- watch files/folders for changes
- tail JSONL / parse sidecar metadata
- normalize source-specific records into shared events
- batch/send events to the hub
- optionally expose small debug UI/logs locally

#### 2. Hub
Central receiver and state manager.

Responsibilities:
- authenticate collectors
- accept normalized events
- deduplicate/reorder when possible
- maintain current entity state
- persist recent history
- expose live event stream and state snapshot to dashboards

#### 3. Dashboard
Purely visual consumer.

Responsibilities:
- subscribe to hub stream
- render agent entities
- animate state transitions
- apply layout rules
- support compact and detailed views

Important rule:

> The dashboard must not contain source-specific parsing logic.
> The hub should also avoid source-specific parsing where possible.
> Source-specific weirdness belongs inside collector plugins.

---

## Core design rules

1. **Watchers first, hooks second**
   - transcript/session watching is the default integration model
   - hooks are optional enrichers, not required dependencies

2. **Normalize early**
   - convert tool-specific events into a common schema in the collector

3. **Parent/child aware entities**
   - support spawned sub-agents and nested sessions

4. **State-driven UI, not raw thought streaming**
   - render meaningful activity transitions, not every internal token or trace fragment

5. **Split by responsibility**
   - collector knows files and local tool formats
   - hub knows streams and state
   - dashboard knows visuals only

---

## Integration model

### Primary integration: watcher plugins
Each supported source gets a watcher plugin.

Examples:
- `plugin-codex-watch`
- `plugin-copilot-watch`
- `plugin-openclaw-watch`
- `plugin-gemini-watch`

A watcher plugin may inspect:
- transcript folders
- session metadata files
- JSONL append-only logs
- temporary checkpoint state if needed
- tool-specific sidecar indices or session maps

### Optional enrichers later
Not required for MVP.

Possible enrichers:
- hook enrichers
- process liveness enrichers
- IDE bridge enrichers
- shell wrapper enrichers

These can improve latency or precision, but the project should still work if none exist.

---

## Entity model
A displayed “face” should represent an **entity**, not just a raw event.

Entity kinds:
- session
- subagent
- tool-run (optional later)
- synthetic/system entity (optional later)

Suggested identity fields:
- `source`
- `sourceHost`
- `sessionId`
- `entityId`
- `parentEntityId`
- `entityKind`
- `displayName`

### Example entity IDs
- `codex:session:abc123`
- `copilot:session:xyz789`
- `openclaw:subagent:researcher:run42`

If a source has no explicit parent-child information, the collector can emit a flat session entity only.

---

## Normalized event schema

```json
{
  "eventId": "uuid-or-deterministic-hash",
  "timestamp": "2026-04-09T20:15:31.000Z",
  "source": "codex",
  "sourceHost": "workstation-main",
  "entityId": "codex:session:abc123",
  "sessionId": "abc123",
  "parentEntityId": null,
  "entityKind": "session",
  "displayName": "Codex",
  "eventType": "message",
  "status": "active",
  "summary": "Reading repository files",
  "detail": "Scanning package.json and src tree",
  "activityScore": 0.75,
  "turnId": "optional",
  "sequence": 182,
  "meta": {
    "toolName": "read_file",
    "result": "success",
    "cwd": "/workspace/project",
    "model": "optional"
  }
}
```

### Minimum event types
- `session_discovered`
- `session_started`
- `message`
- `activity`
- `tool_start`
- `tool_end`
- `error`
- `heartbeat`
- `session_finished`
- `session_archived`

### Notes
- `eventId` should be deterministic when possible to help deduplication.
- `sequence` can be source-local if global ordering is unavailable.
- `activityScore` is a normalized hint for UI prioritization.

---

## Collector plugin SDK sketch

```ts
export interface CollectorPlugin {
  id: string;
  source: string;

  discover(config: PluginContext): Promise<DiscoveredSessionRoot[]>;
  watch(root: DiscoveredSessionRoot, ctx: WatchContext): Promise<WatchHandle>;
  parseRecord(input: SourceRecord, ctx: ParseContext): NormalizedEvent[];
}

export interface DiscoveredSessionRoot {
  id: string;
  path: string;
  host: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedEvent {
  eventId: string;
  timestamp: string;
  source: string;
  sourceHost: string;
  entityId: string;
  sessionId?: string;
  parentEntityId?: string | null;
  entityKind: "session" | "subagent" | "tool-run";
  displayName: string;
  eventType: string;
  status?: string;
  summary?: string;
  detail?: string;
  activityScore?: number;
  turnId?: string;
  sequence?: number;
  meta?: Record<string, unknown>;
}
```

### Optional enrichers interface later

```ts
export interface EventEnricher {
  id: string;
  enrich(events: NormalizedEvent[]): Promise<NormalizedEvent[]>;
}
```

---

## Collector behavior

### Discovery
Collectors should not hardcode only one path if the source supports overrides.
A plugin should support:
- default home/path conventions
- environment variable overrides
- explicit configured roots
- multiple roots if needed

### Watching
Each watcher plugin should support:
- file create
- file append
- file rotate/replace if applicable
- session directory discovery
- rehydration on startup

### Parsing
Parsers should:
- tolerate malformed partial lines
- track per-file offsets
- resume after restart
- emit deterministic IDs when possible
- avoid sending duplicate already-read records

### Transmission
Collectors send normalized events to the hub via:
- HTTP batch POST for safety
- optional WebSocket streaming later

MVP recommendation:
- start with HTTP batch POST
- poll/send every 250–1000 ms or on append burst

---

## Hub design

### Responsibilities
- receive event batches from collectors
- authenticate using simple shared secret or token
- deduplicate by `eventId`
- maintain current entity state projection
- broadcast changes to dashboards over WebSocket or SSE
- store recent event history for replay/detail views

### Suggested endpoints
- `POST /api/events/batch`
- `GET /api/state`
- `GET /api/events/recent`
- `GET /ws`
- `GET /health`

### Entity state projection
The hub should maintain a current state object per entity:

```ts
interface EntityState {
  entityId: string;
  source: string;
  sourceHost: string;
  displayName: string;
  entityKind: string;
  sessionId?: string;
  parentEntityId?: string | null;
  currentStatus: "active" | "idle" | "sleepy" | "dormant" | "done" | "error";
  lastEventAt: string;
  lastSummary?: string;
  activityScore: number;
  recentEvents: string[];
}
```

---

## Dashboard behavior

### Layout rules
Avoid freeform resizing that causes jitter.
Use bucketed layouts:

- 1 active entity: fullscreen hero tile
- 2 active entities: 2 columns
- 3–4 active entities: 2x2
- 5–6 active entities: 3x2
- 7–8 active entities: 4x2

Optional later:
- hero tile + supporting tiles based on `activityScore`

### State machine for decay
Recommended inactivity thresholds:

- `0–10s`: **active**
- `10–30s`: **idle**
- `30–90s`: **sleepy**
- `90–300s`: **dormant**
- `>300s`: archive or hide unless pinned

### Visual mapping ideas
- active/planning: orbiting dots, alert eyes
- tool usage: tiny icon or badge
- success: brief smile pulse
- error: red blink, worried face
- sleepy: slow breathing animation
- done: content smile, dim halo

### Modes
1. **Ambient mode**
   - pretty, minimal text, good for side display
2. **Debug mode**
   - shows recent normalized events, timings, IDs, summaries

---

## Storage strategy

### Collector local state
Each collector should persist:
- file offsets
- discovered session roots
- dedupe cache for last sent event IDs
- last successful transmission checkpoint

Suggested local format:
- JSON state file for MVP
- SQLite later if needed

### Hub state
For MVP:
- in-memory active entity projection
- append-only recent event log on disk or SQLite

Later:
- durable event store
- replay support
- query/search over past sessions

---

## Security / trust model
MVP can stay simple:
- shared secret or bearer token between collectors and hub
- allowlist of collector IDs
- optional LAN/Tailscale-only deployment

Do not overbuild auth early.
But do not leave the ingest API completely open.

---

## Why this is better than hook-first
A hook-first plan tends to overfit to the best-supported runtimes and breaks down when:
- hook support is missing
- hook payloads are incomplete
- Windows support differs
- IDE integration is fundamentally different from CLI integration
- users already have agent tools running and do not want wrapper scripts everywhere

Watcher-first gives you:
- a lower common denominator that still works
- easier bring-up across tools
- the option to add hooks only where they improve things materially

---

## Risks and mitigations

### Risk: session formats change
Mitigation:
- isolate parsing per plugin
- version parsers
- use sample fixtures/tests for each source

### Risk: append timing is delayed, dashboard looks stale
Mitigation:
- add process or hook enrichers later
- infer lightweight heartbeats from file updates or running process

### Risk: truncated/compacted transcripts
Mitigation:
- parse incrementally
- emit only new normalized events
- keep entity state projection resilient to missing older history

### Risk: path assumptions break on Windows / custom homes / containers
Mitigation:
- support explicit configured roots
- support env-based overrides
- avoid hardcoding only one `~/.tool` path in business logic

---

## Monorepo suggestion

```text
/agent-watch
  /apps
    /collector
    /hub
    /dashboard
  /packages
    /event-schema
    /plugin-sdk
    /ui-core
    /shared-config
  /plugins
    /plugin-codex-watch
    /plugin-copilot-watch
    /plugin-openclaw-watch
    /plugin-gemini-watch
  /docs
    /idea.md
    /spec.md
    /tasks.md
    /fixtures
```

### Tech suggestion
- TypeScript monorepo
- Node.js for collector and hub
- React for dashboard
- WebSocket or SSE for live updates
- SQLite optional for hub persistence

Avoid desktop wrapping until the core architecture works.
If needed later, the dashboard can be wrapped in Tauri or Electron.

---

## MVP scope

### In scope
- collector app with plugin loader
- one or two watcher plugins
- central hub with batch ingest API
- dashboard with 1–8 entity layout
- state decay and face animation
- recent event sidebar or detail pane

### Out of scope for MVP
- full historical search
- fancy permissions system
- direct IDE deep integration
- cross-user tenancy
- perfect causal ordering
- source-specific tool-run reconstruction for every runtime

---

## Suggested phases / milestones

## Phase 0 — architecture and fixtures
Goal:
- lock the normalized event schema
- gather sample transcript/session fixtures from target tools
- define plugin SDK

Deliverables:
- `packages/event-schema`
- `packages/plugin-sdk`
- `docs/spec.md`
- fixture samples for at least 2 sources

Success criteria:
- one source sample can be parsed into normalized events in tests

## Phase 1 — collector skeleton
Goal:
- load plugins
- discover roots
- watch files
- emit batches to stdout or mock sink

Deliverables:
- `apps/collector`
- offset persistence
- plugin runner

Success criteria:
- collector can restart without re-emitting everything

## Phase 2 — first real plugins
Goal:
- implement at least 2 watcher plugins
- parse real session data into common events

Candidate order:
1. OpenClaw
2. Copilot CLI
3. Codex CLI
4. Gemini CLI

Success criteria:
- two tools produce stable entities in a shared stream

## Phase 3 — hub
Goal:
- ingest, dedupe, project state, broadcast live state

Deliverables:
- HTTP batch ingest
- entity projection
- WebSocket/SSE stream
- recent event cache

Success criteria:
- multiple collectors can send to one hub

## Phase 4 — dashboard MVP
Goal:
- show live entities with activity states and layout logic

Deliverables:
- entity tiles
- sleep/idle/dormant transitions
- ambient mode
- debug mode

Success criteria:
- 1–8 concurrent entities display cleanly

## Phase 5 — hardening
Goal:
- improve reliability and operator experience

Ideas:
- better reconnect logic
- replay recent events on dashboard connect
- config files + env overrides
- more fixtures and parser tests

## Phase 6 — optional enrichers
Goal:
- add hooks or process enrichers only where they clearly help

Examples:
- faster tool-start/tool-end visibility
- better parent-child linkage
- better “currently active” inference

---

## Stub spec examples

## `docs/spec.md` stub

```md
# Spec

## Problem
Users run multiple local AI agent runtimes, but there is no shared, low-friction way to visualize active sessions across tools.

## Goals
- Watch local session/transcript stores
- Normalize into one event schema
- Send to central hub
- Render living multi-agent dashboard

## Non-goals
- Full transcript search in MVP
- Deep native IDE integration in MVP
- Reliance on hooks for base functionality

## Functional requirements
1. Collector discovers supported session roots.
2. Collector tails new transcript/session data.
3. Collector emits normalized events.
4. Hub stores current entity state.
5. Dashboard displays active entities with decay behavior.

## Quality requirements
- restart-safe
- tolerant of malformed partial lines
- low enough latency for ambient live display
- configurable paths and hosts
```

## `docs/tasks.md` stub

```md
# Tasks

## Event schema
- [ ] Define TypeScript schema package
- [ ] Add runtime validation
- [ ] Add test fixtures

## Collector
- [ ] Plugin loader
- [ ] File watcher abstraction
- [ ] Offset persistence
- [ ] Batch sender

## Plugins
- [ ] OpenClaw watcher plugin
- [ ] Copilot watcher plugin
- [ ] Codex watcher plugin
- [ ] Gemini watcher plugin

## Hub
- [ ] POST /api/events/batch
- [ ] Entity state projection
- [ ] WebSocket stream
- [ ] Recent event store

## Dashboard
- [ ] Tile layout engine
- [ ] Face/state animations
- [ ] Ambient mode
- [ ] Debug mode
```

## `docs/fixtures.md` stub

```md
# Fixtures

Store redacted sample transcript/session files for each supported source.
Each fixture should include:
- original file type/path description
- parser assumptions
- expected normalized event output
```

---

## Configuration sketch

### Collector env example

```env
COLLECTOR_ID=workstation-main
HUB_URL=http://localhost:47831
HUB_TOKEN=change-me
PLUGIN_ENABLE_OPENCLAW=true
PLUGIN_ENABLE_COPILOT=true
PLUGIN_ENABLE_CODEX=true
PLUGIN_ENABLE_GEMINI=false
STATE_DIR=./data/collector-state
```

### Hub env example

```env
PORT=47831
HUB_TOKEN=change-me
EVENT_RETENTION_COUNT=10000
STATE_DIR=./data/hub
```

### Explicit roots example

```json
{
  "plugins": {
    "openclaw": {
      "roots": ["/home/user/.openclaw/agents/main/sessions"]
    },
    "copilot": {
      "roots": ["/home/user/.copilot/session-state"]
    },
    "codex": {
      "roots": ["/home/user/.codex"]
    }
  }
}
```

---

## Implementation notes for Codex/Copilot/etc.
Do not hardcode assumptions in the dashboard.
Do not hardcode only one home path in parsers.
Do not assume every source flushes immediately.
Do not assume every source provides the same level of structured metadata.

Prefer:
- fixture-driven parser development
- incremental append parsing
- deterministic event IDs
- source-local parsing tests

---

## Codex-ready build prompt

```md
You are implementing a watcher-first multi-agent dashboard system in a TypeScript monorepo.

Architecture:
- apps/collector: local source-host collector that watches session/transcript folders
- apps/hub: central API receiver and state projection service
- apps/dashboard: React dashboard that visualizes entities from hub events
- packages/event-schema: shared types and validators
- packages/plugin-sdk: collector plugin interfaces and helpers
- plugins/plugin-openclaw-watch
- plugins/plugin-copilot-watch
- plugins/plugin-codex-watch
- plugins/plugin-gemini-watch

Important constraints:
- watcher-first architecture
- hooks are optional enrichers later, not the core integration model
- all source-specific parsing belongs in collector plugins
- hub and dashboard must remain source-agnostic
- dashboard visualizes state transitions, not raw chain-of-thought
- collector must be restart-safe and track file offsets
- use deterministic event IDs where possible
- support configurable roots and environment overrides

Implementation priorities:
1. scaffold monorepo
2. implement shared event schema package with runtime validation
3. implement plugin SDK
4. implement collector with watcher abstraction and batch sender
5. implement hub with POST /api/events/batch, in-memory entity projection, websocket broadcast
6. implement dashboard with 1–8 entity layout, decay state machine, ambient/debug modes
7. implement one real watcher plugin first using fixture-driven tests

Coding guidance:
- TypeScript throughout
- keep code modular and testable
- avoid giant source-specific conditionals in shared code
- include clear README and sample config
- use small focused packages
- prefer simple reliable MVP over overengineering

Deliverables:
- runnable monorepo
- sample plugin
- tests for schema and parser fixture
- basic dashboard showing fake or real normalized events
```

---

## Recommended first implementation order
1. event schema package
2. fixture samples
3. plugin SDK
4. collector core
5. one plugin using real fixture samples
6. hub
7. dashboard
8. second plugin
9. optional enrichers later

---

## Final takeaway
This project should treat local session/transcript storage as the common denominator.
That makes the system practical across multiple runtimes without depending on fragile or incomplete hook ecosystems.

The real product is not “hooking into AI tools.”
The real product is:

> **turning messy local agent session traces into a stable, living, source-agnostic event stream that can be visualized cleanly.**
