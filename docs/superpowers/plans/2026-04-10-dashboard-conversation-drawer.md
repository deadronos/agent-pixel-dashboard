# Dashboard Conversation Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a side drawer that opens from a grouped dashboard card and shows the conversation’s underlying members and recent activity without disturbing the overview grid.

**Architecture:** Keep the current grouped card grid as the overview, then add a selected-group state that drives a fixed-position drawer on the right. The hub will expose a read-only conversation detail endpoint built from its existing in-memory entity map and rolling raw-event buffer, while the dashboard fetches that detail on demand and renders it alongside the grouped summary already on screen.

**Tech Stack:** React 19, TypeScript, Vite, Express, WebSocket, existing dashboard/hub state helpers, Vitest.

---

### Task 1: Add hub conversation detail lookup

**Files:**

- Create: `/Users/openclaw/Github/agent-pixel-dashboard/apps/hub/src/conversation-detail.ts`
- Modify: `/Users/openclaw/Github/agent-pixel-dashboard/apps/hub/src/index.ts`
- Test: `/Users/openclaw/Github/agent-pixel-dashboard/apps/hub/src/conversation-detail.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildConversationDetail } from './conversation-detail.js';
import type { EntityState } from './state.js';
import type { NormalizedEvent } from '@agent-watch/event-schema';

const entities: EntityState[] = [
  {
    entityId: 'codex:session:abc',
    source: 'codex',
    sourceHost: 'workstation',
    displayName: 'Codex',
    entityKind: 'session',
    sessionId: 'abc',
    parentEntityId: null,
    currentStatus: 'active',
    lastEventAt: '2026-04-10T10:00:00.000Z',
    lastSummary: 'Working',
    activityScore: 0.8,
    recentEvents: ['evt_1', 'evt_2'],
  },
];

const recentEvents: NormalizedEvent[] = [
  {
    eventId: 'evt_1',
    timestamp: '2026-04-10T09:59:00.000Z',
    source: 'codex',
    sourceHost: 'workstation',
    entityId: 'codex:session:abc',
    sessionId: 'abc',
    parentEntityId: null,
    entityKind: 'session',
    displayName: 'Codex',
    eventType: 'message',
    status: 'active',
    summary: 'First turn',
    activityScore: 0.5,
    sequence: 1,
  },
  {
    eventId: 'evt_2',
    timestamp: '2026-04-10T10:00:00.000Z',
    source: 'codex',
    sourceHost: 'workstation',
    entityId: 'codex:session:abc',
    sessionId: 'abc',
    parentEntityId: null,
    entityKind: 'session',
    displayName: 'Codex',
    eventType: 'tool_use',
    status: 'active',
    summary: 'Read file',
    activityScore: 0.8,
    sequence: 2,
  },
];

it('builds a detail view from source + sessionId', () => {
  const detail = buildConversationDetail({
    entities,
    recentEvents,
    source: 'codex',
    sessionId: 'abc',
  });

  expect(detail?.groupId).toBe('codex|abc');
  expect(detail?.members.map(member => member.entityId)).toEqual(['codex:session:abc']);
  expect(detail?.recentEvents.map(event => event.eventId)).toEqual(['evt_1', 'evt_2']);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm --workspace @agent-watch/hub run test -- src/conversation-detail.test.ts`

Expected: FAIL with a missing module/export error for `buildConversationDetail`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// apps/hub/src/conversation-detail.ts
import type { NormalizedEvent } from '@agent-watch/event-schema';
import type { EntityState } from './state.js';

export interface ConversationDetail {
  groupId: string;
  source: string;
  sessionId?: string;
  entityId: string;
  representative: EntityState | null;
  members: EntityState[];
  recentEvents: NormalizedEvent[];
}

export function buildConversationDetail(input: {
  entities: readonly EntityState[];
  recentEvents: readonly NormalizedEvent[];
  source: string;
  sessionId?: string;
  entityId?: string;
}): ConversationDetail | null {
  const members = input.entities.filter(entity => {
    if (input.sessionId) {
      return entity.source === input.source && entity.sessionId === input.sessionId;
    }
    return entity.entityId === input.entityId;
  });

  const representative = members[0] ?? null;
  if (!representative) {
    return null;
  }

  const recent = input.recentEvents.filter(event => {
    if (input.sessionId) {
      return event.source === input.source && event.sessionId === input.sessionId;
    }
    return event.entityId === input.entityId;
  });

  return {
    groupId: input.sessionId
      ? `${input.source}|${input.sessionId}`
      : `${input.source}|${input.entityId}`,
    source: input.source,
    sessionId: input.sessionId,
    entityId: representative.entityId,
    representative,
    members,
    recentEvents: recent,
  };
}
```

Wire `/api/entity-detail` in `apps/hub/src/index.ts` so the dashboard can request the selected conversation by `source` + `sessionId` or fallback `entityId`. Return a 404 when no matching group exists.

- [ ] **Step 4: Run the hub tests and lint**

Run:
`npm --workspace @agent-watch/hub run test`
`npm --workspace @agent-watch/hub run lint`

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/conversation-detail.ts apps/hub/src/conversation-detail.test.ts apps/hub/src/index.ts
git commit -m "feat: add hub conversation detail lookup"
```

### Task 2: Add dashboard selection state and detail loading

**Files:**

- Create: `/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/conversation-detail.ts`
- Modify: `/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/App.tsx`
- Modify: `/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/dashboard-view.ts` if a small selector helper is needed for the drawer key
- Test: `/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/conversation-detail.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildConversationDetailUrl } from './conversation-detail.js';

it('builds the entity-detail URL from the selected group', () => {
  const url = buildConversationDetailUrl('http://localhost:3032', {
    source: 'codex',
    sessionId: 'abc',
    entityId: 'codex:session:abc',
  });

  expect(url).toBe('http://localhost:3032/api/entity-detail?source=codex&sessionId=abc');
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm --workspace @agent-watch/dashboard run test -- src/conversation-detail.test.ts`

Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
// apps/dashboard/src/conversation-detail.ts
export function buildConversationDetailUrl(
  hubHttp: string,
  group: { source: string; sessionId?: string; entityId: string }
): string {
  const params = new URLSearchParams({ source: group.source });
  if (group.sessionId) {
    params.set('sessionId', group.sessionId);
  } else {
    params.set('entityId', group.entityId);
  }
  return `${hubHttp.replace(/\/$/, '')}/api/entity-detail?${params.toString()}`;
}
```

Update `apps/dashboard/src/App.tsx` so it tracks:

- the selected grouped card
- drawer loading state
- drawer error state
- the fetched conversation detail payload

Use the selected group from `getVisibleEntityGroups(...)`, and clear the selection when the group disappears because filtering changed.

- [ ] **Step 4: Run the dashboard tests and lint**

Run:
`npm --workspace @agent-watch/dashboard run test -- src/conversation-detail.test.ts src/dashboard-view.test.ts`
`npm --workspace @agent-watch/dashboard run lint`

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/conversation-detail.ts apps/dashboard/src/conversation-detail.test.ts apps/dashboard/src/App.tsx apps/dashboard/src/dashboard-view.ts
git commit -m "feat: add dashboard conversation selection"
```

### Task 3: Build the drawer UI and card interaction

**Files:**

- Create: `/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/ConversationDrawer.tsx`
- Modify: `/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/AgentFaceCard.tsx`
- Modify: `/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/styles.css`
- Modify: `/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/App.tsx`
- Test: `/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/ConversationDrawer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConversationDrawer } from './ConversationDrawer.js';

it('renders the selected conversation summary and member list', () => {
  const markup = renderToStaticMarkup(
    createElement(ConversationDrawer, {
      open: true,
      group: {
        groupId: 'codex|abc',
        source: 'codex',
        sessionId: 'abc',
        entityId: 'codex:session:abc',
        representative: {
          entityId: 'codex:session:abc',
          source: 'codex',
          sourceHost: 'workstation',
          displayName: 'Codex',
          entityKind: 'session',
          currentStatus: 'active',
          lastEventAt: '2026-04-10T10:00:00.000Z',
          activityScore: 0.8,
        },
        members: [],
        memberCount: 1,
        lastEventAt: '2026-04-10T10:00:00.000Z',
        currentStatus: 'active',
        activityScore: 0.8,
      },
      detail: {
        recentEvents: [
          {
            eventId: 'evt_1',
            timestamp: '2026-04-10T09:59:00.000Z',
            source: 'codex',
            sourceHost: 'workstation',
            entityId: 'codex:session:abc',
            sessionId: 'abc',
            parentEntityId: null,
            entityKind: 'session',
            displayName: 'Codex',
            eventType: 'message',
            status: 'active',
            summary: 'First turn',
            activityScore: 0.5,
            sequence: 1,
          },
        ],
        members: [],
      },
      loading: false,
      error: null,
      onClose: () => undefined,
    })
  );

  expect(markup).toContain('Conversation');
  expect(markup).toContain('First turn');
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm --workspace @agent-watch/dashboard run test -- src/ConversationDrawer.test.tsx`

Expected: FAIL because `ConversationDrawer` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```tsx
// apps/dashboard/src/ConversationDrawer.tsx
export function ConversationDrawer(props: {
  open: boolean;
  group: {
    groupId: string;
    source: string;
    sessionId?: string;
    entityId: string;
    representative: { displayName: string; currentStatus: string; lastEventAt: string };
    members: Array<{ entityId: string; entityKind: string; lastEventAt: string }>;
    memberCount: number;
  };
  detail: {
    recentEvents: Array<{ eventId: string; summary?: string; detail?: string }>;
    members: unknown[];
  } | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  // Render a fixed drawer with a backdrop, a header, a member list, and a timeline.
}
```

Update `AgentFaceCard.tsx` so cards accept `selected` and `onClick`, add a selected class, and keep the grid spacing stable. Update `styles.css` to render the drawer as a fixed right-side panel with a backdrop, and make the selected card visibly highlighted without changing the layout flow.

- [ ] **Step 4: Run the dashboard tests, lint, and build**

Run:
`npm --workspace @agent-watch/dashboard run test -- src/ConversationDrawer.test.tsx src/dashboard-view.test.ts`
`npm --workspace @agent-watch/dashboard run lint`
`npm --workspace @agent-watch/dashboard run build`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/ConversationDrawer.tsx apps/dashboard/src/ConversationDrawer.test.tsx apps/dashboard/src/AgentFaceCard.tsx apps/dashboard/src/App.tsx apps/dashboard/src/styles.css
git commit -m "feat: add dashboard conversation drawer"
```

### Task 4: Wire up regression coverage and finish polish

**Files:**

- Modify: `/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/dashboard-view.test.ts`
- Modify: `/Users/openclaw/Github/agent-pixel-dashboard/apps/dashboard/src/ConversationDrawer.test.tsx`
- Modify: `/Users/openclaw/Github/agent-pixel-dashboard/apps/hub/src/conversation-detail.test.ts`

- [ ] **Step 1: Add regression tests for the grouping and drawer behavior**

Add a dashboard test that verifies:

- clicking the same card toggles the drawer closed
- clicking a different card swaps the drawer contents
- pressing `Esc` closes the drawer
- the drawer remains open while filters change only if the selected group is still visible

Add a hub test that verifies:

- source + sessionId selects the right conversation
- entityId fallback works when sessionId is missing
- unmatched lookups return `null`

- [ ] **Step 2: Run the targeted tests and confirm they fail if the interaction regresses**

Run:
`npm --workspace @agent-watch/dashboard run test -- src/dashboard-view.test.ts src/ConversationDrawer.test.tsx`
`npm --workspace @agent-watch/hub run test -- src/conversation-detail.test.ts`

Expected: PASS after the earlier tasks, and FAIL if the selection or lookup behavior is broken.

- [ ] **Step 3: Tighten the interaction details**

```tsx
// App-level interaction rules
// - close on Escape
// - close on backdrop click
// - close when the selected group falls out of the visible groups list
// - keep the overview grid mounted and stable
```

Make any final copy edits in the drawer so the empty states and labels read naturally with the grouped-card UI.

- [ ] **Step 4: Run the full workspace verification**

Run:
`npm run test`
`npm run lint`
`npm run build`

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/dashboard-view.test.ts apps/dashboard/src/ConversationDrawer.test.tsx apps/hub/src/conversation-detail.test.ts
git commit -m "test: cover dashboard conversation drawer"
```

## Self-Review Checklist

- The plan covers the hub detail lookup, dashboard selection/fetch, drawer UI, and regression tests.
- The plan keeps the collector protocol unchanged.
- The grouped card grid stays stable while the drawer is open.
- There are no placeholder steps like “TODO” or “add tests for the above” without specifics.
- File ownership is narrow and the tasks can be executed independently with frequent commits.
