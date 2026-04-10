import { describe, expect, it } from "vitest";
import type { ResolvedSettings } from "./dashboard-settings.js";
import { getGridColumns, getVisibleEntities } from "./dashboard-view.js";

const entities = [
  {
    entityId: "1",
    source: "codex",
    entityKind: "worker",
    currentStatus: "active",
    lastEventAt: "2026-04-10T10:00:00.000Z",
    activityScore: 0.9
  },
  {
    entityId: "2",
    source: "claude",
    entityKind: "session",
    currentStatus: "dormant",
    lastEventAt: "2026-04-10T09:00:00.000Z",
    activityScore: 0.2
  },
  {
    entityId: "3",
    source: "gemini",
    entityKind: "worker",
    currentStatus: "idle",
    lastEventAt: "2026-04-10T10:05:00.000Z",
    activityScore: 0.7
  }
] as const;

const recentSettings = {
  layout: { maxAgentsShown: 3, density: "comfortable", sortMode: "recent" },
  filters: { hideDormant: false, hideDone: false, visibleSources: [], visibleEntityKinds: [] }
} satisfies Pick<ResolvedSettings, "layout" | "filters">;

describe("getVisibleEntities", () => {
  it("filters dormant entities and respects maxAgentsShown", () => {
    const result = getVisibleEntities(entities, {
      layout: { maxAgentsShown: 1, density: "comfortable", sortMode: "activity" },
      filters: { hideDormant: true, hideDone: false, visibleSources: [], visibleEntityKinds: [] }
    } satisfies Pick<ResolvedSettings, "layout" | "filters">);

    expect(result.map((entity) => entity.entityId)).toEqual(["1"]);
  });

  it("supports recent sorting", () => {
    const result = getVisibleEntities(entities, recentSettings);

    expect(result.map((entity) => entity.entityId)).toEqual(["3", "1", "2"]);
  });

  it("pushes invalid timestamps to the end in recent sorting", () => {
    const settings = {
      layout: { maxAgentsShown: 3, density: "comfortable", sortMode: "recent" },
      filters: { hideDormant: false, hideDone: false, visibleSources: [], visibleEntityKinds: [] }
    } satisfies Pick<ResolvedSettings, "layout" | "filters">;

    const result = getVisibleEntities(
      [
        {
          entityId: "bad-a",
          source: "gemini",
          entityKind: "worker",
          currentStatus: "idle",
          lastEventAt: "not-a-date",
          activityScore: 0.8
        },
        {
          entityId: "valid",
          source: "codex",
          entityKind: "worker",
          currentStatus: "active",
          lastEventAt: "2026-04-10T10:00:00.000Z",
          activityScore: 0.4
        },
        {
          entityId: "bad-b",
          source: "mistral",
          entityKind: "worker",
          currentStatus: "idle",
          lastEventAt: "still-not-a-date",
          activityScore: 0.1
        }
      ],
      settings
    );

    expect(result.map((entity) => entity.entityId)).toEqual(["valid", "bad-a", "bad-b"]);
  });
});

describe("getGridColumns", () => {
  it("caps compact layouts at more columns than comfortable layouts", () => {
    expect(getGridColumns(6, "comfortable")).toBe(3);
    expect(getGridColumns(6, "compact")).toBe(4);
  });
});
