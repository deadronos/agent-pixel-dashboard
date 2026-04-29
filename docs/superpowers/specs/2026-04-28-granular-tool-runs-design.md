# Granular "Tool-Run" Sub-Entities Design

## Problem Statement

Currently in the Agent Watch MVP, entities are primarily tracked at the `session` level. When an agent executes a long-running operation—such as a complex bash command, an exhaustive codebase search, or a slow web scrape—the dashboard simply displays an "active" status with a vague `summary` string. 

While this is sufficient for a high-level overview, it lacks precision. Developers debugging stuck or looping agents need surgical visibility into *what* specific tool is executing, what inputs it was given, how long it has been running, and its eventual standard output or error.

## Inspiration

The `/claude-ville` project solves this by attaching deep historical structures to its session models, such as `toolHistory`, `lastTool`, `lastToolInput`, and full `messages` arrays in `AgentSessionSummary` and `AdapterSessionDetail`.

While that approach is comprehensive, it is highly session-centric. In a "watcher-first" dashboard, dumping large nested arrays into a single session entity is contrary to the event-driven animation model.

## Proposed Solution

Instead of bloating the session entity, we will explicitly leverage the existing `entityKind: "tool-run"` and `parentEntityId` fields in the `NormalizedEvent` schema. 

A long-running tool execution will be tracked as its own first-class entity on the dashboard, nested visually under its parent session.

### 1. Collector & Plugin Layer

Watcher plugins (e.g., `plugin-openclaw-watch`, `plugin-copilot-watch`) will be updated to emit distinct events when a tool execution begins and ends.

- **`tool_start`**: Emits a new event where `entityId` is uniquely generated for the tool call (e.g., `openclaw:session:123:tool:grep_search_456`), `entityKind` is `tool-run`, and `parentEntityId` is the session ID. The `meta` object will contain the tool name and input arguments.
- **`tool_output`** (optional): Streams intermediate logs (like stdout chunks).
- **`tool_end`**: Transitions the `tool-run` entity to `done` or `error` with the final result or stderr in `detail`.

### 2. Hub State Projection

The Hub's `HubStore` currently maintains a flat list of entities. Because `tool-run` entities are valid `DashboardEntity` objects, they will be ingested and stored automatically.

We need to ensure that:
1. Tool-run entities naturally decay and are archived faster than standard sessions (e.g., a finished tool run disappears after 30 seconds, while a finished session lingers for 5 minutes).
2. The `/api/state` payload can be easily grouped by `parentEntityId` on the client.

### 3. Dashboard UI Layer

The `apps/dashboard` layout engine will be updated to support parent-child entity rendering.

- **Nesting**: In the layout grid, if an entity has a `parentEntityId`, it should not be rendered as a standalone hero tile. Instead, it should be rendered inside or immediately adjacent to its parent's `AgentFaceCard`.
- **Visualization**: A `tool-run` might not need a full "face". It could be visualized as a compact progress bar, a terminal snippet box, or a glowing pulse under the agent's main avatar.
- **Transience**: Once a tool run transitions to `done` or `error`, it should remain visible long enough for the user to read the result, then fade out.

## Schema Enhancements

We will standardize the `meta` payload for `tool-run` entities in `packages/event-schema/src/index.ts`:

```typescript
// Proposed standardized meta shapes for tool runs
export const ToolRunMetaSchema = z.object({
  toolName: z.string(),
  inputs: z.record(z.unknown()).optional(),
  output: z.string().optional(),
  exitCode: z.number().optional(),
  durationMs: z.number().optional()
});
```

## Benefits

1. **Zero Schema Breakage**: We already have `entityKind: "tool-run"` and `parentEntityId`.
2. **Real-time Feel**: Seeing tools spawn and complete gives the dashboard a highly kinetic, "alive" feeling.
3. **Debuggability**: Users instantly see *exactly* what command an agent is running without needing to open the full conversation drawer.