# Dashboard Conversation Drawer Design

## Goal

Add a click-through side drawer to the dashboard so a grouped card can be inspected without reshaping the face grid.

The drawer should feel like the `claude-ville` detail panel pattern:

- click a card to inspect one conversation
- keep the overview grid stable
- show the stable conversation identity, its collapsed members, and the latest activity trail

## Non-Goals

- No inline expansion inside the face grid
- No editing controls in the drawer
- No new collector event format
- No attempt to merge unrelated conversations across providers

## Grouping Model

The dashboard already groups cards by `source + sessionId` when a session id exists, and falls back to `entityId` otherwise.

That grouping stays the primary unit of inspection:

- the card represents one conversation group
- the drawer opens for the selected group
- the drawer shows every member that collapsed into that group

If a group has only one member, the drawer still opens, but it reads as a single conversation detail view rather than a multi-item bundle.

## Data Flow

The dashboard will keep the current live grid behavior, then add a selected-group state.

When the user clicks a card:

1. the selected group id is stored in React state
2. the dashboard fetches detail data for that group
3. the side drawer renders the fetched detail plus the grouped summary already on hand

The drawer content should be derived from the same stable key the grid uses, so the detail view always matches what the user clicked.

## Backend Shape

The hub should expose a narrow detail endpoint for grouped conversations, likely under `/api/entity-detail`.

Recommended request shape:

- `entityId` for the fallback case
- `source` and `sessionId` when the conversation has a stable session key

Recommended response shape:

- current entity snapshot
- all currently known members for that group
- recent raw events for the same group, newest first

The hub can build this from its existing in-memory entity map plus the rolling raw-event log. No new persistence layer is required for the first pass.

## Drawer Contents

The drawer should include:

- group title
- status badge
- stable identity fields
- member list, including `entityKind`, `entityId`, and last event time
- recent activity timeline, including summary/detail text when present
- a short empty state when there are no matched events yet

The group summary should appear before the timeline so the user can orient themselves quickly.

## Interaction

- Clicking the same card again closes the drawer.
- Clicking a different card swaps the drawer contents in place.
- Pressing `Esc` closes the drawer.
- Clicking the backdrop outside the drawer closes it.

The drawer should not affect the card grid layout or scroll position.

## Error Handling

If detail loading fails, the drawer should still open with the group summary and show a small retryable error state for the timeline section.

If the detail endpoint is unavailable, the dashboard should fall back to the already-rendered grouped summary instead of blocking the overview.

## Testing

Add tests for:

- group selection and deselection behavior
- the drawer opening on card click
- the drawer closing on `Esc`
- detail grouping from source/session key
- fallback behavior when no detail data is available

Add hub-level tests for the detail endpoint shape if the endpoint is introduced.

## Success Criteria

- The grid stays stable while inspecting details.
- A card click opens a side drawer with the selected conversation.
- The drawer shows collapsed members and recent activity for the selected group.
- The dashboard still works when only the overview data is available.
