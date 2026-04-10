import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentFaceCard } from "./AgentFaceCard.js";
import { ConversationDrawer } from "./ConversationDrawer.js";
import type { DashboardEntityGroup } from "./dashboard-view.js";
import type { ConversationDetailPayload } from "./conversation-detail.js";
import type { ThemePreset, VisualRule } from "./dashboard-settings.js";

const theme: ThemePreset = {
  id: "test",
  label: "Test",
  pageBackground: "#fff",
  panelBackground: "#fff",
  textColor: "#111",
  mutedTextColor: "#666"
};

const visualRules: VisualRule[] = [];

const group = {
  groupId: "codex|abc",
  sessionId: "abc",
  source: "codex",
  currentStatus: "active",
  lastEventAt: "2026-04-10T10:00:00.000Z",
  activityScore: 0.8,
  memberCount: 2,
  representative: {
    entityId: "codex:session:abc",
    source: "codex",
    entityKind: "session",
    currentStatus: "active",
    lastEventAt: "2026-04-10T10:00:00.000Z",
    activityScore: 0.8
  },
  members: [
    {
      entityId: "codex:session:abc",
      source: "codex",
      entityKind: "session",
      currentStatus: "active",
      lastEventAt: "2026-04-10T10:00:00.000Z",
      activityScore: 0.8
    },
    {
      entityId: "codex:tool:xyz",
      source: "codex",
      entityKind: "tool-run",
      currentStatus: "idle",
      lastEventAt: "2026-04-10T09:58:00.000Z",
      activityScore: 0.4
    }
  ]
} satisfies DashboardEntityGroup;

const detail: ConversationDetailPayload = {
  groupId: "codex|abc",
  group: {
    source: "codex",
    sessionId: "abc",
    entityId: "codex:session:abc"
  },
  matchedBy: "session",
  current: {
    entityId: "codex:session:abc",
    source: "codex",
    sourceHost: "workstation",
    displayName: "Codex",
    entityKind: "session",
    sessionId: "abc",
    parentEntityId: null,
    currentStatus: "active",
    lastEventAt: "2026-04-10T10:00:00.000Z",
    lastSummary: "Selected summary",
    activityScore: 0.8,
    recentEvents: ["evt_1"]
  },
  representative: {
    entityId: "codex:session:abc",
    source: "codex",
    sourceHost: "workstation",
    displayName: "Codex",
    entityKind: "session",
    sessionId: "abc",
    parentEntityId: null,
    currentStatus: "active",
    lastEventAt: "2026-04-10T10:00:00.000Z",
    lastSummary: "Selected summary",
    activityScore: 0.8,
    recentEvents: ["evt_1"]
  },
  members: [
    {
      entityId: "codex:session:abc",
      source: "codex",
      sourceHost: "workstation",
      displayName: "Codex",
      entityKind: "session",
      sessionId: "abc",
      parentEntityId: null,
      currentStatus: "active",
      lastEventAt: "2026-04-10T10:00:00.000Z",
      lastSummary: "Selected summary",
      activityScore: 0.8,
      recentEvents: ["evt_1"]
    },
    {
      entityId: "codex:tool:xyz",
      source: "codex",
      sourceHost: "workstation",
      displayName: "Codex Tool",
      entityKind: "tool-run",
      sessionId: "abc",
      parentEntityId: "codex:session:abc",
      currentStatus: "idle",
      lastEventAt: "2026-04-10T09:58:00.000Z",
      lastSummary: "Tool summary",
      activityScore: 0.4,
      recentEvents: []
    }
  ],
  recentEvents: [
    {
      eventId: "evt_1",
      timestamp: "2026-04-10T09:59:00.000Z",
      source: "codex",
      sourceHost: "workstation",
      entityId: "codex:session:abc",
      sessionId: "abc",
      parentEntityId: null,
      entityKind: "session",
      displayName: "Codex",
      eventType: "message",
      status: "active",
      summary: "First turn",
      detail: "A detailed note",
      activityScore: 0.5,
      sequence: 1,
      meta: {}
    }
  ]
};

describe("ConversationDrawer", () => {
  it("renders the selected conversation summary, member list, and timeline", () => {
    const markup = renderToStaticMarkup(
      createElement(ConversationDrawer, {
        open: true,
        group,
        detail,
        loading: false,
        error: null,
        onClose: () => undefined
      })
    );

    expect(markup).toContain("Conversation");
    expect(markup).toContain("Selected summary");
    expect(markup).toContain("Codex Tool");
    expect(markup).toContain("First turn");
  });
});

describe("AgentFaceCard", () => {
  it("adds a selected state without changing the card content", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentFaceCard, {
        entity: {
          entityId: "codex:session:abc",
          source: "codex",
          sourceHost: "workstation",
          displayName: "Codex",
          entityKind: "session",
          currentStatus: "active",
          lastEventAt: "2026-04-10T10:00:00.000Z",
          lastSummary: "Selected summary",
          activityScore: 0.8
        },
        groupCount: 2,
        theme,
        visualRules,
        selected: true,
        onClick: () => undefined
      })
    );

    expect(markup).toContain("face-card selected");
    expect(markup).toContain("Selected summary");
  });
});
