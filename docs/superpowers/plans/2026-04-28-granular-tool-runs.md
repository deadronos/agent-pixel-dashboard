# Implementation Plan: Granular Tool-Run Entities

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement granular `tool-run` tracking as distinct entities nested beneath agent sessions, providing high-fidelity visibility into long-running operations. 

**Architecture:** Update `packages/event-schema` to define standardized tool run metadata. Update the `apps/hub` to age-out tool runs faster. Update the `apps/dashboard` UI to render nested tool runs. Finally, update one collector plugin (e.g. `plugin-openclaw-watch`) to emit `tool_start` and `tool_end` events.

---

## File map

```text
packages/event-schema/src/
  index.test.ts                    MODIFY — test new schema updates
  index.ts                         MODIFY — add ToolRunMetaSchema, export ToolRunMeta

apps/hub/src/
  state.test.ts                    MODIFY — test tool decay overrides
  state.ts                         MODIFY — override decay logic for tool runs

apps/dashboard/src/
  dashboard-grouping.ts            MODIFY — add getChildEntities helper
  AgentFaceCard.tsx                MODIFY — render nested child tool runs
  styles.css                       MODIFY — add styles for nested tool entities

plugins/plugin-openclaw-watch/src/
  index.ts                         MODIFY — parse tool invocations and emit child events
  parser.test.ts                   MODIFY — add tests for tool start/end parsing
```

---

## Task 1: Schema Updates in `event-schema`

**Files:**
- Modify: `packages/event-schema/src/index.ts`
- Modify: `packages/event-schema/src/index.test.ts`

- [ ] **Step 1: Add ToolRunMetaSchema**
  In `packages/event-schema/src/index.ts`, define `ToolRunMetaSchema`:
  ```typescript
  export const ToolRunMetaSchema = z.object({
    toolName: z.string(),
    inputs: z.record(z.unknown()).optional(),
    output: z.string().optional(),
    exitCode: z.number().optional(),
    durationMs: z.number().optional()
  });

  export type ToolRunMeta = z.infer<typeof ToolRunMetaSchema>;
  ```

- [ ] **Step 2: Export `ToolRunMeta` type**
  Export the newly created type so collectors and the dashboard can import it.

- [ ] **Step 3: Update schema tests**
  In `index.test.ts`, add a test block verifying `ToolRunMetaSchema.parse()` works for valid tool meta payloads and fails on missing `toolName`.

- [ ] **Step 4: Commit**
  ```bash
  git add packages/event-schema
  git commit -m "feat(schema): add ToolRunMetaSchema for granular tool runs"
  ```

---

## Task 2: Hub State Decay Overrides

**Files:**
- Modify: `apps/hub/src/hub-store.ts` or related state handlers where expiration happens.
  *(Note: The plan assumes state decay logic lives where `getStatusFromTimestamp` is used. If it's in `event-schema/src/index.ts`, we update `resolveEntityStatus` there.)*

- [ ] **Step 1: Update Status Resolution for Tools**
  In `packages/event-schema/src/index.ts`, modify `resolveEntityStatus` or add a `LIVE_STATUS_WINDOWS_MS` override.
  Tool runs should decay faster. Once a tool is `done` or `error`, it should disappear from the active entity list within 30-60 seconds, whereas sessions can remain `dormant` for 5 minutes.
  
  *Alternative approach:* Add a UI-side filter in the dashboard to hide `done` tools older than 30s. This is simpler and doesn't pollute the hub's generic state logic. Let's go with the UI-side filter for `tool-run` specific expiration to keep the Hub generic.
  
- [ ] **Step 2: Commit**
  *(Skip if doing UI-side filtering only. If altering schema logic, commit here).*

---

## Task 3: Dashboard Layout Updates

**Files:**
- Modify: `apps/dashboard/src/AgentFaceCard.tsx`
- Modify: `apps/dashboard/src/dashboard-grouping.ts`
- Modify: `apps/dashboard/src/styles.css`

- [ ] **Step 1: Extract child tools**
  In `dashboard-grouping.ts`, implement a function to map child entities (where `entityKind === "tool-run"`) to their respective `parentEntityId`.

- [ ] **Step 2: Render nested tool runs**
  In `AgentFaceCard.tsx`, update the component to accept an array of `childEntities`. 
  Iterate over `childEntities` and render a smaller, compact `<div className="tool-run-indicator">`.
  Display `entity.displayName` (which will be the tool name) and an animated spinner or progress bar if `currentStatus === "active"`.
  If `currentStatus === "done"` or `"error"`, show a success check or error cross, then apply a CSS fade-out animation if the `lastEventAt` is older than 15 seconds.

- [ ] **Step 3: Update Grid Layout logic**
  Ensure that `tool-run` entities are *filtered out* of the top-level hero tile grid so they don't consume their own giant column. They should strictly render inside their parent.

- [ ] **Step 4: Commit**
  ```bash
  git add apps/dashboard
  git commit -m "feat(dashboard): render nested tool-run entities in AgentFaceCard"
  ```

---

## Task 4: Collector Plugin Updates (e.g., OpenClaw)

**Files:**
- Modify: `plugins/plugin-openclaw-watch/src/index.ts`
- Modify: `plugins/plugin-openclaw-watch/src/parser.test.ts` (or equivalent parsing file)

- [ ] **Step 1: Parse tool invocations**
  Update the plugin to detect when OpenClaw (or Copilot/Gemini) invokes a tool. Extract the tool name and arguments.

- [ ] **Step 2: Emit `tool_start` event**
  Generate a deterministic child `entityId` using `makeDeterministicEventId` based on the session and the tool name/sequence.
  Emit a `NormalizedEvent` with:
  ```typescript
  {
    entityId: childEntityId,
    parentEntityId: session.entityId,
    entityKind: "tool-run",
    eventType: "tool_start",
    status: "active",
    displayName: toolName,
    summary: `Running ${toolName}...`,
    meta: {
      toolName,
      inputs: parsedArgs
    }
  }
  ```

- [ ] **Step 3: Emit `tool_end` event**
  When the transcript indicates the tool returned output, emit an event transitioning the child entity to `done` or `error`.
  ```typescript
  {
    entityId: childEntityId,
    parentEntityId: session.entityId,
    entityKind: "tool-run",
    eventType: "tool_end",
    status: "done", // or "error"
    displayName: toolName,
    summary: `Finished ${toolName}`,
    detail: toolOutputText,
    meta: {
      toolName,
      output: toolOutputText,
      durationMs
    }
  }
  ```

- [ ] **Step 4: Test and Commit**
  Run the plugin's unit tests with a mock fixture.
  ```bash
  cd plugins/plugin-openclaw-watch && npx vitest run
  git add plugins/plugin-openclaw-watch
  git commit -m "feat(openclaw-watch): emit nested tool-run entities"
  ```

---

## Completion Checklist

- [ ] 1. Schema `ToolRunMetaSchema` added and tested
- [ ] 2. Dashboard grid filters out `entityKind: "tool-run"` from top-level tiles
- [ ] 3. Dashboard `AgentFaceCard` renders child tools with visual state logic
- [ ] 4. At least one collector plugin parses and emits valid `tool_start` and `tool_end` entities
- [ ] 5. End-to-end local test: Run collector, start an agent with a slow tool (like web_fetch or grep), and verify the nested card appears.